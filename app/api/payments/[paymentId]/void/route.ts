import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { voidPayment } from "@/lib/payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.role !== "manager") {
      throw new AuthError("Forbidden: Only managers can void payments", 403);
    }

    const { paymentId } = await params;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new AuthError("Invalid JSON body", 400);
    }

    const reason = typeof body.reason === "string" ? body.reason : undefined;
    if (!reason || reason.trim().length === 0) {
      throw new AuthError("Missing reason", 400);
    }

    const result = await voidPayment({
      orgId: auth.orgId,
      actorId: auth.userId,
      paymentId,
      reason,
    });

    return NextResponse.json({ status: result.status }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
