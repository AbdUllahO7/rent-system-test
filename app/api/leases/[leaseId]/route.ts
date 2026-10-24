import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceStatus, InvoiceStatus } from "@/lib/billing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    const { leaseId } = await params;

    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, orgId: auth.orgId },
      include: {
        invoices: {
          include: { allocations: true },
        },
        payments: true,
      },
    });

    if (!lease) {
      throw new AuthError("Lease not found", 404);
    }

    // Tenant can only see their own lease
    if (auth.role === "tenant" && lease.tenantId !== auth.tenantId) {
      throw new AuthError("Lease not found", 404);
    }

    const now = new Date();

    // Invoices in allocation order: due_date ASC, deposit before rent, period_index ASC
    const invoices = [...lease.invoices].sort((a, b) => {
      const dueA = new Date(a.dueDate).getTime();
      const dueB = new Date(b.dueDate).getTime();
      if (dueA !== dueB) return dueA - dueB;

      const kindWeightA = a.kind === "deposit" ? 0 : 1;
      const kindWeightB = b.kind === "deposit" ? 0 : 1;
      if (kindWeightA !== kindWeightB) return kindWeightA - kindWeightB;

      return (a.periodIndex ?? 0) - (b.periodIndex ?? 0);
    }).map((inv) => {
      const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
      const amountSen = Number(inv.amountSen);
      const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);

      const status: InvoiceStatus = invoiceStatus(
        { dueDate: dueDateStr, amountSen, paidSen },
        now
      );

      return {
        id: inv.id,
        kind: inv.kind as "deposit" | "rent",
        periodIndex: inv.periodIndex,
        periodStart: inv.periodStart ? new Date(inv.periodStart).toISOString().slice(0, 10) : null,
        periodEnd: inv.periodEnd ? new Date(inv.periodEnd).toISOString().slice(0, 10) : null,
        dueDate: dueDateStr,
        amountSen,
        paidSen,
        status,
      };
    });

    const payments = lease.payments.map((p) => ({
      id: p.id,
      amountSen: Number(p.amountSen),
      unappliedSen: Number(p.unappliedSen),
      method: p.method as "cash" | "bank_transfer" | "online",
      status: p.status as "pending_verification" | "approved" | "rejected" | "voided",
      receivedAt: new Date(p.receivedAt).toISOString(),
    }));

    return NextResponse.json({
      lease: {
        id: lease.id,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        startDate: new Date(lease.startDate).toISOString().slice(0, 10),
        endDate: new Date(lease.endDate).toISOString().slice(0, 10),
        monthlyRentSen: Number(lease.monthlyRentSen),
        depositSen: Number(lease.depositSen),
      },
      invoices,
      payments,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
