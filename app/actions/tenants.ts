"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateTenantPhoneAction(
  tenantId: string,
  newPhone: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = newPhone.trim();
  if (!trimmed) {
    return { success: false, error: "Phone number cannot be empty" };
  }

  const cleanDigits = trimmed.replace(/\D/g, "");
  if (cleanDigits.length < 8) {
    return {
      success: false,
      error: "Please enter a valid phone number (at least 8 digits, e.g. +60 12-345 6789)",
    };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { phone: trimmed },
    });
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update phone number";
    return { success: false, error: message };
  }
}
