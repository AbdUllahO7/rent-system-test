import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthError, handleApiError } from "@/lib/auth";
import { createLease } from "@/lib/leases";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.role !== "manager") {
      throw new AuthError("Forbidden: Only managers can create leases", 403);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new AuthError("Invalid JSON body", 400);
    }

    const unitId = typeof body.unitId === "string" ? body.unitId : undefined;
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : undefined;
    const startDate = typeof body.startDate === "string" ? body.startDate : undefined;
    const endDate = typeof body.endDate === "string" ? body.endDate : undefined;
    const monthlyRentSen = typeof body.monthlyRentSen === "number" ? body.monthlyRentSen : undefined;
    const depositSen = typeof body.depositSen === "number" ? body.depositSen : undefined;

    if (!unitId || !tenantId || !startDate || !endDate || monthlyRentSen === undefined || depositSen === undefined) {
      throw new AuthError("Missing required lease fields", 400);
    }

    const result = await createLease({
      orgId: auth.orgId,
      actorId: auth.userId,
      unitId,
      tenantId,
      startDate,
      endDate,
      monthlyRentSen,
      depositSen,
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
