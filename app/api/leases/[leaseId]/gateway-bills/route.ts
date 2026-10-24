import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(
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
      },
    });

    if (!lease) {
      throw new AuthError("Lease not found", 404);
    }

    // Another tenant's record gets 404 (do not reveal existence)
    if (auth.role === "tenant" && lease.tenantId !== auth.tenantId) {
      throw new AuthError("Lease not found", 404);
    }

    // Role does not allow this action (manager/staff) gets 403
    if (auth.role !== "tenant") {
      throw new AuthError("Forbidden: Only the lease tenant can create a gateway bill", 403);
    }

    // Malaysia today date string (UTC+8)
    const msInUtc8 = Date.now() + 8 * 3600 * 1000;
    const utc8 = new Date(msInUtc8);
    const y = utc8.getUTCFullYear();
    const m = String(utc8.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc8.getUTCDate()).padStart(2, "0");
    const todayMalaysia = `${y}-${m}-${d}`;

    // Sum unpaid amounts of invoices due on or before today Malaysia
    let totalDueNowSen = BigInt(0);

    for (const inv of lease.invoices) {
      const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
      if (dueDateStr <= todayMalaysia) {
        const paidSen = inv.allocations.reduce((sum, a) => sum + BigInt(a.amountSen), BigInt(0));
        const unpaidSen = BigInt(inv.amountSen) - paidSen;
        if (unpaidSen > BigInt(0)) {
          totalDueNowSen += unpaidSen;
        }
      }
    }

    if (totalDueNowSen <= BigInt(0)) {
      throw new AuthError("Nothing due now", 422);
    }

    // Bill ids must be impossible to guess
    const billId = `bill_${crypto.randomBytes(16).toString("hex")}`;

    await prisma.gatewayBill.create({
      data: {
        id: billId,
        orgId: auth.orgId,
        leaseId,
        amountSen: totalDueNowSen,
        status: "pending",
      },
    });

    return NextResponse.json(
      {
        billId,
        amountSen: Number(totalDueNowSen),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
