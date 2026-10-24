import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceRoleSupabase } from "@/lib/supabase/service-role";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; paymentId: string }> }
): Promise<NextResponse> {
  const { paymentId } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { slipPath: true, orgId: true },
  });

  if (!payment || !payment.slipPath) {
    return NextResponse.json({ error: "Slip not found" }, { status: 404 });
  }

  const supabase = getServiceRoleSupabase();
  const { data, error } = await supabase.storage
    .from("payment-slips")
    .createSignedUrl(payment.slipPath, 3600);

  if (error || !data?.signedUrl) {
    // If not found in storage or error, return 404
    return NextResponse.json({ error: "Could not generate slip link" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
