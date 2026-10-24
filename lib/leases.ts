import { prisma } from "@/lib/prisma";
import { generateSchedule } from "@/lib/billing";
import { AuthError } from "@/lib/auth";
import crypto from "crypto";

export interface CreateLeaseInput {
  orgId: string;
  actorId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
}

export async function createLease(input: CreateLeaseInput): Promise<{ id: string }> {
  const { orgId, actorId, unitId, tenantId, startDate, endDate, monthlyRentSen, depositSen } = input;

  // 1. Validate dates and amounts using generateSchedule validation
  let scheduledInvoices;
  try {
    scheduledInvoices = generateSchedule({
      startDate,
      endDate,
      monthlyRentSen,
      depositSen,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid lease parameters";
    throw new AuthError(message, 400);
  }

  // 2. Atomic Transaction with Unit Row Lock to prevent concurrent overlapping leases
  return await prisma.$transaction(async (tx) => {
    // Check unit exists in org and lock it
    const unit = await tx.unit.findFirst({
      where: { id: unitId, orgId },
    });
    if (!unit) {
      throw new AuthError("Unit not found in organization", 404);
    }

    // Lock unit row to serialize lease creation on this unit
    await tx.$executeRaw`SELECT id FROM "units" WHERE id = ${unitId} FOR UPDATE`;

    // Check tenant exists in org
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, orgId },
    });
    if (!tenant) {
      throw new AuthError("Tenant not found in organization", 404);
    }

    // Overlap check on unit (both dates inclusive: new.start <= existing.end && new.end >= existing.start)
    const startD = new Date(startDate);
    const endD = new Date(endDate);

    const overlappingLeases = await tx.lease.findMany({
      where: {
        unitId,
        startDate: { lte: endD },
        endDate: { gte: startD },
      },
    });

    if (overlappingLeases.length > 0) {
      throw new AuthError("Lease dates overlap with an existing lease on this unit", 409);
    }

    // Create lease
    const leaseId = `lease_${crypto.randomUUID()}`;
    await tx.lease.create({
      data: {
        id: leaseId,
        orgId,
        unitId,
        tenantId,
        startDate: startD,
        endDate: endD,
        monthlyRentSen: BigInt(monthlyRentSen),
        depositSen: BigInt(depositSen),
      },
    });

    // Create invoices from schedule
    for (let i = 0; i < scheduledInvoices.length; i++) {
      const inv = scheduledInvoices[i];
      const invoiceId = `inv_${crypto.randomUUID()}`;
      await tx.invoice.create({
        data: {
          id: invoiceId,
          orgId,
          leaseId,
          kind: inv.kind,
          periodIndex: inv.periodIndex,
          periodStart: inv.periodStart ? new Date(inv.periodStart) : null,
          periodEnd: inv.periodEnd ? new Date(inv.periodEnd) : null,
          dueDate: new Date(inv.dueDate),
          amountSen: BigInt(inv.amountSen),
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        id: `aud_${crypto.randomUUID()}`,
        orgId,
        actorId,
        action: "lease.created",
        entityId: leaseId,
        details: {
          unitId,
          tenantId,
          startDate,
          endDate,
          monthlyRentSen,
          depositSen,
          invoicesCount: scheduledInvoices.length,
        },
      },
    });

    return { id: leaseId };
  });
}
