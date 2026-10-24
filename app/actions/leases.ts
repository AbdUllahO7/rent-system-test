"use server";

import { createLease } from "@/lib/leases";
import { revalidatePath } from "next/cache";

export async function createLeaseAction(input: {
  orgId: string;
  actorId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const result = await createLease(input);
    revalidatePath("/");
    return { success: true, id: result.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create lease";
    return { success: false, error: message };
  }
}
