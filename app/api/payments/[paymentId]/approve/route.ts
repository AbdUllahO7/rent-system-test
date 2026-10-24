import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { approvePayment } from "@/lib/payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.role !== "manager") {
      throw new AuthError("Forbidden: Only managers can approve payments", 403);
    }

    const { paymentId } = await params;

    const result = await approvePayment({
      orgId: auth.orgId,
      actorId: auth.userId,
      paymentId,
    });

    return NextResponse.json({ status: result.status }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
