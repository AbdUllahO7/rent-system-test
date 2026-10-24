"use server";

import { revalidatePath } from "next/cache";
import { recordPayment, approvePayment, rejectPayment, voidPayment } from "@/lib/payments";
import { getServiceRoleSupabase } from "@/lib/supabase/service-role";

export async function recordPaymentAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const orgId = formData.get("orgId") as string;
  const actorId = formData.get("actorId") as string;
  const role = (formData.get("role") as "manager" | "staff") || "manager";
  const leaseId = formData.get("leaseId") as string;
  const amountSen = Number(formData.get("amountSen"));
  const method = formData.get("method") as "cash" | "bank_transfer" | "online";
  const receivedAt = (formData.get("receivedAt") as string) || new Date().toISOString();

  if (!orgId || !leaseId || !amountSen || !method) {
    return { success: false, error: "Missing required fields for recording payment." };
  }

  let uploadedSlipPath: string | null = null;

  // Handle bank transfer slip upload
  if (method === "bank_transfer") {
    const file = formData.get("slipFile");
    if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
      const slipFile = file as File;

      if (slipFile.size > 5 * 1024 * 1024) {
        return { success: false, error: "The uploaded slip must be at most 5 MB." };
      }

      const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
      if (!allowedTypes.includes(slipFile.type)) {
        return { success: false, error: "The slip must be a JPEG, PNG or PDF document." };
      }

      try {
        const supabase = getServiceRoleSupabase();
        const ext = slipFile.name.split(".").pop() || "png";
        const uniqueName = `slip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
        const storagePath = `${orgId}/${uniqueName}`;

        const arrayBuffer = await slipFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from("payment-slips")
          .upload(storagePath, buffer, {
            contentType: slipFile.type,
            upsert: false,
          });

        if (uploadError) {
          return { success: false, error: `Failed to upload slip: ${uploadError.message}` };
        }

        uploadedSlipPath = storagePath;
      } catch (uploadErr: unknown) {
        const msg = uploadErr instanceof Error ? uploadErr.message : "Slip upload failed";
        return { success: false, error: msg };
      }
    } else {
      // Check if slipPath is pre-supplied
      const preSlip = formData.get("slipPath") as string | null;
      if (preSlip) {
        uploadedSlipPath = preSlip;
      } else {
        return { success: false, error: "A bank transfer payment requires a slip upload." };
      }
    }
  }

  try {
    await recordPayment({
      orgId,
      actorId,
      role,
      leaseId,
      amountSen,
      method,
      receivedAt,
      slipPath: uploadedSlipPath ?? undefined,
    });

    revalidatePath("/");
    revalidatePath(`/leases/${leaseId}`);
    return { success: true };
  } catch (recordError: unknown) {
    // If recording fails after upload, the file must not be left behind
    if (uploadedSlipPath) {
      try {
        const supabase = getServiceRoleSupabase();
        await supabase.storage.from("payment-slips").remove([uploadedSlipPath]);
      } catch (cleanupErr) {
        console.error("Cleanup error after failed recordPayment:", cleanupErr);
      }
    }
    const message = recordError instanceof Error ? recordError.message : "Failed to record payment.";
    return { success: false, error: message };
  }
}

export async function approvePaymentAction(
  orgId: string,
  actorId: string,
  paymentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await approvePayment({ orgId, actorId, paymentId });
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to approve payment";
    return { success: false, error: message };
  }
}

export async function rejectPaymentAction(
  orgId: string,
  actorId: string,
  paymentId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length < 5) {
    return { success: false, error: "A rejection reason with at least 5 characters is required." };
  }

  try {
    await rejectPayment({ orgId, actorId, paymentId, reason: trimmed });
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reject payment";
    return { success: false, error: message };
  }
}

export async function voidPaymentAction(
  orgId: string,
  actorId: string,
  paymentId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length < 5) {
    return { success: false, error: "A void reason with at least 5 characters is required." };
  }

  try {
    await voidPayment({ orgId, actorId, paymentId, reason: trimmed });
    revalidatePath("/");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to void payment";
    return { success: false, error: message };
  }
}
