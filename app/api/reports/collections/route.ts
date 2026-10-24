import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { getCollectionsReport } from "@/lib/reports";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.role !== "manager" && auth.role !== "staff") {
      throw new AuthError("Forbidden: Only staff and managers can view collections report", 403);
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      throw new AuthError("from and to query parameters are required (YYYY-MM)", 400);
    }

    const report = await getCollectionsReport(auth.orgId, from, to);
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
