"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export async function createTenantGatewayBillAction(
  leaseId: string
): Promise<{ success: boolean; billId?: string; amountSen?: number; error?: string }> {
  try {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        invoices: {
          include: { allocations: true },
        },
      },
    });

    if (!lease) {
      return { success: false, error: "Lease not found" };
    }

    // Today in Malaysia time (UTC+8) YYYY-MM-DD
    const now = new Date();
    const msInUtc8 = now.getTime() + 8 * 3600 * 1000;
    const todayMytStr = new Date(msInUtc8).toISOString().slice(0, 10);

    // Sum unpaid sen for invoices due on or before today's Malaysia date
    let amountDueNowSen = 0;
    for (const inv of lease.invoices) {
      const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
      if (dueDateStr <= todayMytStr) {
        const paid = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
        const remaining = Number(inv.amountSen) - paid;
        if (remaining > 0) {
          amountDueNowSen += remaining;
        }
      }
    }

    if (amountDueNowSen <= 0) {
      return { success: false, error: "Nothing due now for this lease" };
    }

    // Un-guessable bill id
    const billId = `bill_${crypto.randomBytes(16).toString("hex")}`;

    await prisma.gatewayBill.create({
      data: {
        id: billId,
        orgId: lease.orgId,
        leaseId: lease.id,
        amountSen: BigInt(amountDueNowSen),
        status: "pending",
      },
    });

    revalidatePath("/");
    revalidatePath(`/leases/${leaseId}`);
    return { success: true, billId, amountSen: amountDueNowSen };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create gateway bill";
    return { success: false, error: message };
  }
}

export async function simulateGatewayPaymentAction(
  billId: string,
  amountSen: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const key = process.env.GATEWAY_X_SIGNATURE_KEY || "test_x_signature_key";
    const payload = new URLSearchParams({
      id: billId,
      paid: "true",
      paid_amount: String(amountSen),
      paid_at: new Date().toISOString(),
    });

    const sortedKeys = Array.from(payload.keys()).sort();
    const signaturePayload = sortedKeys.map((k) => `${k}=${payload.get(k)}`).join("|");
    const signature = crypto.createHmac("sha256", key).update(signaturePayload).digest("hex");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${appUrl}/api/webhooks/gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Signature": signature,
      },
      body: payload.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Gateway webhook rejected (${res.status}): ${text}` };
    }

    revalidatePath("/");
    return { success: true, message: "Bill paid and settled through gateway webhook!" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Simulation failed";
    return { success: false, error: message };
  }
}
