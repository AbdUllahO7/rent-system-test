import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Section 5: Gateway Webhook Handler
 * POST /api/webhooks/gateway (application/x-www-form-urlencoded)
 */
export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const params = new URLSearchParams(rawText);
    const fields: Record<string, string> = {};
    for (const [key, val] of params.entries()) {
      fields[key] = val;
    }

    const signature = fields.x_signature;
    const secretKey = process.env.GATEWAY_X_SIGNATURE_KEY;

    if (!signature || !secretKey) {
      return NextResponse.json({ error: "Missing signature or secret key" }, { status: 401 });
    }

    // 1. Verify HMAC-SHA256 signature
    // Sort keys alphabetically by character code, exclude x_signature
    const sortedKeys = Object.keys(fields)
      .filter((k) => k !== "x_signature")
      .sort();

    const source = sortedKeys.map((k) => `${k}${fields[k]}`).join("|");
    const expectedSig = crypto.createHmac("sha256", secretKey).update(source).digest("hex");

    if (signature !== expectedSig) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const billId = fields.id;
    if (!billId) {
      return NextResponse.json({ error: "Missing bill id" }, { status: 404 });
    }

    // 2. Find bill
    const bill = await prisma.gatewayBill.findUnique({
      where: { id: billId },
    });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const isPaid = fields.paid === "true";
    const paidAmount = parseInt(fields.paid_amount, 10);

    // 3. If paid=true
    if (isPaid) {
      // Check amount
      if (paidAmount !== Number(bill.amountSen)) {
        return NextResponse.json({ error: "paid_amount does not match bill amount" }, { status: 422 });
      }

      // If already paid (repeat delivery) -> 200, None
      if (bill.status === "paid") {
        return NextResponse.json({ message: "Bill already settled" }, { status: 200 });
      }

      // Atomic transition with row locking
      await prisma.$transaction(async (tx) => {
        // Lock bill row
        await tx.$executeRaw`SELECT id FROM "gateway_bills" WHERE id = ${bill.id} FOR UPDATE`;

        const freshBill = await tx.gatewayBill.findUnique({ where: { id: bill.id } });
        if (freshBill?.status === "paid") {
          return;
        }

        // Mark bill paid
        await tx.gatewayBill.update({
          where: { id: bill.id },
          data: { status: "paid" },
        });

        // Parse received_at: format "2026-04-01 00:30:12 +0800"
        let receivedDate: Date;
        try {
          receivedDate = new Date(fields.paid_at);
          if (isNaN(receivedDate.getTime())) {
            receivedDate = new Date();
          }
        } catch {
          receivedDate = new Date();
        }

        // Create approved online payment
        const paymentId = `pay_${crypto.randomUUID()}`;
        await tx.payment.create({
          data: {
            id: paymentId,
            orgId: bill.orgId,
            leaseId: bill.leaseId,
            amountSen: bill.amountSen,
            unappliedSen: BigInt(0),
            method: "online",
            status: "approved",
            receivedAt: receivedDate,
            gatewayBillId: bill.id,
          },
        });

        // Allocate payment to unpaid invoices in allocation order
        const invoices = await tx.invoice.findMany({
          where: { leaseId: bill.leaseId, orgId: bill.orgId },
          include: { allocations: true },
        });

        const unpaidInvoices = invoices.map((inv) => {
          const paidSen = inv.allocations.reduce((sum, a) => sum + BigInt(a.amountSen), BigInt(0));
          const remainingSen = BigInt(inv.amountSen) - paidSen;
          return {
            ...inv,
            paidSen,
            remainingSen: remainingSen > BigInt(0) ? remainingSen : BigInt(0),
          };
        }).filter((inv) => inv.remainingSen > BigInt(0));

        // Sort: dueDate ASC, deposit before rent, periodIndex ASC
        unpaidInvoices.sort((a, b) => {
          const dueA = new Date(a.dueDate).getTime();
          const dueB = new Date(b.dueDate).getTime();
          if (dueA !== dueB) return dueA - dueB;

          const kindWeightA = a.kind === "deposit" ? 0 : 1;
          const kindWeightB = b.kind === "deposit" ? 0 : 1;
          if (kindWeightA !== kindWeightB) return kindWeightA - kindWeightB;

          return (a.periodIndex ?? 0) - (b.periodIndex ?? 0);
        });

        let toAllocate = BigInt(bill.amountSen);

        for (const inv of unpaidInvoices) {
          if (toAllocate <= BigInt(0)) break;

          const allocAmount = toAllocate < inv.remainingSen ? toAllocate : inv.remainingSen;
          await tx.paymentAllocation.create({
            data: {
              id: `alloc_${crypto.randomUUID()}`,
              orgId: bill.orgId,
              paymentId,
              invoiceId: inv.id,
              amountSen: allocAmount,
            },
          });

          toAllocate -= allocAmount;
        }

        // Store leftover in unappliedSen
        if (toAllocate > BigInt(0)) {
          await tx.payment.update({
            where: { id: paymentId },
            data: { unappliedSen: toAllocate },
          });
        }

        // Audit log
        await tx.auditLog.create({
          data: {
            id: `aud_${crypto.randomUUID()}`,
            orgId: bill.orgId,
            action: "gateway.bill_paid",
            entityId: bill.id,
            details: { paymentId, amountSen: Number(bill.amountSen) },
          },
        });
      });

      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      // paid = false
      if (bill.status === "paid") {
        // "paid=false, bill already paid (late or out of order): 200 None: a paid bill never goes back"
        return NextResponse.json({ message: "Paid bill cannot be reverted" }, { status: 200 });
      }

      if (bill.status === "failed") {
        // Repeat failure delivery
        return NextResponse.json({ message: "Bill already failed" }, { status: 200 });
      }

      // Pending bill becomes failed
      await prisma.gatewayBill.update({
        where: { id: bill.id },
        data: { status: "failed" },
      });

      return NextResponse.json({ success: true, status: "failed" }, { status: 200 });
    }
  } catch (error) {
    console.error("Gateway webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
