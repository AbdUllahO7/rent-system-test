import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { recordPayment } from "@/lib/payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.role !== "manager" && auth.role !== "staff") {
      throw new AuthError("Forbidden: Only staff and managers can record payments", 403);
    }

    const { leaseId } = await params;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new AuthError("Invalid JSON body", 400);
    }

    const amountSen = typeof body.amountSen === "number" ? body.amountSen : undefined;
    const method = typeof body.method === "string" ? (body.method as "cash" | "bank_transfer" | "online") : undefined;
    const receivedAt = typeof body.receivedAt === "string" ? body.receivedAt : undefined;
    const slipPath = typeof body.slipPath === "string" ? body.slipPath : undefined;

    if (amountSen === undefined || !method || !receivedAt) {
      throw new AuthError("Missing required payment fields", 400);
    }

    const result = await recordPayment({
      orgId: auth.orgId,
      actorId: auth.userId,
      role: auth.role,
      leaseId,
      amountSen,
      method,
      receivedAt,
      slipPath,
    });

    return NextResponse.json({ id: result.id, status: result.status }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
