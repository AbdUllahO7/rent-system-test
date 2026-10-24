import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";
import crypto from "crypto";

export interface RecordPaymentInput {
  orgId: string;
  actorId: string;
  role: 'manager' | 'staff';
  leaseId: string;
  amountSen: number;
  method: 'cash' | 'bank_transfer' | 'online';
  receivedAt: string;
  slipPath?: string;
  gatewayBillId?: string;
}

import { Prisma } from "@prisma/client";

interface InvoiceForAllocation {
  id: string;
  kind: string;
  dueDate: Date | string;
  periodIndex: number | null;
  amountSen: bigint;
  allocations: Array<{ amountSen: bigint }>;
}

interface UnpaidInvoice extends InvoiceForAllocation {
  paidSen: bigint;
  remainingSen: bigint;
}

/**
 * Allocates an approved payment's amount to unpaid invoices of the lease.
 * Priority order: dueDate, then deposit before rent, then periodIndex.
 * Any remainder is stored in payment.unappliedSen.
 */
async function allocatePaymentTx(
  tx: Prisma.TransactionClient,
  orgId: string,
  paymentId: string,
  leaseId: string,
  amountSen: bigint
): Promise<bigint> {
  // Fetch all invoices for the lease
  const invoices = (await tx.invoice.findMany({
    where: { leaseId, orgId },
    include: { allocations: true },
  })) as InvoiceForAllocation[];

  // Calculate unpaid amount for each invoice
  const unpaidInvoices: UnpaidInvoice[] = invoices
    .map((inv) => {
      const paidSen = inv.allocations.reduce(
        (sum: bigint, a) => sum + BigInt(a.amountSen),
        BigInt(0)
      );
      const remainingSen = BigInt(inv.amountSen) - paidSen;
      return {
        ...inv,
        paidSen,
        remainingSen: remainingSen > BigInt(0) ? remainingSen : BigInt(0),
      };
    })
    .filter((inv) => inv.remainingSen > BigInt(0));

  // Sort: dueDate ASC, kind ('deposit' before 'rent'), periodIndex ASC
  unpaidInvoices.sort((a, b) => {
    const dueA = new Date(a.dueDate).getTime();
    const dueB = new Date(b.dueDate).getTime();
    if (dueA !== dueB) return dueA - dueB;

    const kindWeightA = a.kind === "deposit" ? 0 : 1;
    const kindWeightB = b.kind === "deposit" ? 0 : 1;
    if (kindWeightA !== kindWeightB) return kindWeightA - kindWeightB;

    return (a.periodIndex ?? 0) - (b.periodIndex ?? 0);
  });

  let toAllocate = amountSen;

  for (const inv of unpaidInvoices) {
    if (toAllocate <= BigInt(0)) break;

    const allocAmount = toAllocate < inv.remainingSen ? toAllocate : inv.remainingSen;
    await tx.paymentAllocation.create({
      data: {
        id: `alloc_${crypto.randomUUID()}`,
        orgId,
        paymentId,
        invoiceId: inv.id,
        amountSen: allocAmount,
      },
    });

    toAllocate -= allocAmount;
  }

  // Update payment unappliedSen if any money left over
  await tx.payment.update({
    where: { id: paymentId },
    data: { unappliedSen: toAllocate },
  });

  return toAllocate;
}

/**
 * Records a cash or bank transfer payment.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<{ id: string; status: string }> {
  const { orgId, actorId, role, leaseId, amountSen, method, receivedAt, slipPath, gatewayBillId } = input;

  if (!Number.isInteger(amountSen) || amountSen <= 0) {
    throw new AuthError("amountSen must be a positive integer", 400);
  }

  if (!['cash', 'bank_transfer', 'online'].includes(method)) {
    throw new AuthError("method must be cash, bank_transfer, or online", 400);
  }

  if (method === 'bank_transfer') {
    if (!slipPath || typeof slipPath !== 'string') {
      throw new AuthError("slipPath is required for bank_transfer payments", 400);
    }
    if (!slipPath.startsWith(`${orgId}/`)) {
      throw new AuthError(`slipPath must point to files in organization folder "${orgId}/"`, 400);
    }
  }

  const receivedDate = new Date(receivedAt);
  if (isNaN(receivedDate.getTime())) {
    throw new AuthError("Invalid receivedAt timestamp", 400);
  }

  return await prisma.$transaction(async (tx) => {
    // Check lease exists in org and lock it
    const lease = await tx.lease.findFirst({
      where: { id: leaseId, orgId },
    });
    if (!lease) {
      throw new AuthError("Lease not found in organization", 404);
    }

    // Pessimistic Row Lock on lease to serialize concurrent payments
    await tx.$executeRaw`SELECT id FROM "leases" WHERE id = ${leaseId} FOR UPDATE`;

    // Cap calculation: totalInvoices - totalAllocated - pendingVerification
    const invoices = await tx.invoice.findMany({
      where: { leaseId, orgId },
      include: { allocations: true },
    });

    const totalInvoicesSen = invoices.reduce((sum, inv) => sum + BigInt(inv.amountSen), BigInt(0));
    const totalAllocatedSen = invoices.reduce(
      (sum, inv) => sum + inv.allocations.reduce((aSum, a) => aSum + BigInt(a.amountSen), BigInt(0)),
      BigInt(0)
    );
    const remainingBalanceSen = totalInvoicesSen - totalAllocatedSen;

    const pendingPayments = await tx.payment.findMany({
      where: { leaseId, orgId, status: 'pending_verification' },
    });
    const pendingTotalSen = pendingPayments.reduce((sum, p) => sum + BigInt(p.amountSen), BigInt(0));

    const maxAllowedSen = remainingBalanceSen - pendingTotalSen;

    if (BigInt(amountSen) > maxAllowedSen) {
      throw new AuthError(
        `Payment of ${amountSen} sen exceeds cap (${maxAllowedSen} sen remaining)`,
        422
      );
    }

    const paymentId = `pay_${crypto.randomUUID()}`;
    const initialStatus = role === 'manager' || method === 'online' ? 'approved' : 'pending_verification';

    await tx.payment.create({
      data: {
        id: paymentId,
        orgId,
        leaseId,
        amountSen: BigInt(amountSen),
        unappliedSen: BigInt(0),
        method,
        status: initialStatus,
        receivedAt: receivedDate,
        slipPath: slipPath || null,
        gatewayBillId: gatewayBillId || null,
        recordedById: actorId,
      },
    });

    if (initialStatus === 'approved') {
      await allocatePaymentTx(tx, orgId, paymentId, leaseId, BigInt(amountSen));
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        id: `aud_${crypto.randomUUID()}`,
        orgId,
        actorId,
        action: initialStatus === 'approved' ? "payment.recorded_approved" : "payment.recorded_pending",
        entityId: paymentId,
        details: { leaseId, amountSen, method, status: initialStatus },
      },
    });

    return { id: paymentId, status: initialStatus };
  });
}

/**
 * Approves a pending_verification payment (Manager only).
 */
export async function approvePayment(input: { orgId: string; actorId: string; paymentId: string }): Promise<{ status: string }> {
  const { orgId, actorId, paymentId } = input;

  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, orgId },
    });
    if (!payment) {
      throw new AuthError("Payment not found in organization", 404);
    }

    if (payment.status !== 'pending_verification') {
      throw new AuthError(`Cannot approve payment with status "${payment.status}"`, 409);
    }

    // Lock lease row
    await tx.$executeRaw`SELECT id FROM "leases" WHERE id = ${payment.leaseId} FOR UPDATE`;

    // Recheck remaining balance: totalInvoices - totalAllocated
    const invoices = await tx.invoice.findMany({
      where: { leaseId: payment.leaseId, orgId },
      include: { allocations: true },
    });

    const totalInvoicesSen = invoices.reduce((sum, inv) => sum + BigInt(inv.amountSen), BigInt(0));
    const totalAllocatedSen = invoices.reduce(
      (sum, inv) => sum + inv.allocations.reduce((aSum, a) => aSum + BigInt(a.amountSen), BigInt(0)),
      BigInt(0)
    );
    const remainingBalanceSen = totalInvoicesSen - totalAllocatedSen;

    if (BigInt(payment.amountSen) > remainingBalanceSen) {
      throw new AuthError(
        `Payment of ${payment.amountSen} sen exceeds lease remaining balance (${remainingBalanceSen} sen)`,
        422
      );
    }

    // Mark approved and allocate
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'approved' },
    });

    await allocatePaymentTx(tx, orgId, paymentId, payment.leaseId, BigInt(payment.amountSen));

    // Audit log
    await tx.auditLog.create({
      data: {
        id: `aud_${crypto.randomUUID()}`,
        orgId,
        actorId,
        action: "payment.approved",
        entityId: paymentId,
        details: { leaseId: payment.leaseId, amountSen: Number(payment.amountSen) },
      },
    });

    return { status: "approved" };
  });
}

/**
 * Rejects a pending_verification payment (Manager only).
 */
export async function rejectPayment(input: { orgId: string; actorId: string; paymentId: string; reason: string }): Promise<{ status: string }> {
  const { orgId, actorId, paymentId, reason } = input;

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AuthError("Reason must be at least 5 characters", 400);
  }

  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, orgId },
    });
    if (!payment) {
      throw new AuthError("Payment not found in organization", 404);
    }

    if (payment.status !== 'pending_verification') {
      throw new AuthError(`Cannot reject payment with status "${payment.status}"`, 409);
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'rejected',
        rejectionReason: reason.trim(),
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        id: `aud_${crypto.randomUUID()}`,
        orgId,
        actorId,
        action: "payment.rejected",
        entityId: paymentId,
        details: { reason: reason.trim() },
      },
    });

    return { status: "rejected" };
  });
}

/**
 * Voids an approved payment (Manager only).
 * Removes that payment's allocations; other payments' allocations do not change.
 */
export async function voidPayment(input: { orgId: string; actorId: string; paymentId: string; reason: string }): Promise<{ status: string }> {
  const { orgId, actorId, paymentId, reason } = input;

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    throw new AuthError("Reason must be at least 5 characters", 400);
  }

  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, orgId },
    });
    if (!payment) {
      throw new AuthError("Payment not found in organization", 404);
    }

    if (payment.status !== 'approved') {
      throw new AuthError(`Cannot void payment with status "${payment.status}". Payment must be approved.`, 409);
    }

    // Lock lease row
    await tx.$executeRaw`SELECT id FROM "leases" WHERE id = ${payment.leaseId} FOR UPDATE`;

    // Remove this payment's allocations
    await tx.paymentAllocation.deleteMany({
      where: { paymentId },
    });

    // Mark voided
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'voided',
        unappliedSen: BigInt(0),
        voidReason: reason.trim(),
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        id: `aud_${crypto.randomUUID()}`,
        orgId,
        actorId,
        action: "payment.voided",
        entityId: paymentId,
        details: { reason: reason.trim() },
      },
    });

    return { status: "voided" };
  });
}
