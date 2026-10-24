"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approvePaymentAction,
  rejectPaymentAction,
  voidPaymentAction,
} from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Ban, Loader2, AlertTriangle } from "lucide-react";

interface PaymentActionsProps {
  paymentId: string;
  orgId: string;
  actorId: string;
  isManager: boolean;
  status: "pending_verification" | "approved" | "rejected" | "voided";
  amountSen: number;
}

export function PaymentActions({
  paymentId,
  orgId,
  actorId,
  isManager,
  status,
  amountSen,
}: PaymentActionsProps) {
  const [isPending, startTransition] = useTransition();

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Void dialog state
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);

  if (!isManager) {
    return null;
  }

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approvePaymentAction(orgId, actorId, paymentId);
      if (res.success) {
        toast.success("Payment approved!", {
          description: `RM ${(amountSen / 100).toFixed(2)} allocated to scheduled invoices.`,
        });
      } else {
        toast.error("Approval failed", {
          description: res.error || "Payment exceeds remaining balance or is invalid.",
        });
      }
    });
  };

  const handleRejectConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rejectReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setRejectError("A reason with at least 5 characters is required.");
      return;
    }

    startTransition(async () => {
      const res = await rejectPaymentAction(orgId, actorId, paymentId, trimmed);
      if (res.success) {
        toast.success("Payment rejected", {
          description: `Reason: ${trimmed}`,
        });
        setRejectOpen(false);
        setRejectReason("");
        setRejectError(null);
      } else {
        toast.error("Rejection failed", {
          description: res.error || "Could not reject payment.",
        });
      }
    });
  };

  const handleVoidConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = voidReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setVoidError("A reason with at least 5 characters is required.");
      return;
    }

    startTransition(async () => {
      const res = await voidPaymentAction(orgId, actorId, paymentId, trimmed);
      if (res.success) {
        toast.success("Payment voided", {
          description: `Allocations reversed. Reason: ${trimmed}`,
        });
        setVoidOpen(false);
        setVoidReason("");
        setVoidError(null);
      } else {
        toast.error("Voiding failed", {
          description: res.error || "Could not void payment.",
        });
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "pending_verification" && (
        <>
          <Button
            size="sm"
            disabled={isPending}
            onClick={handleApprove}
            className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 font-medium shadow-xs"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Check className="h-3 w-3 mr-1" />
            )}
            Approve
          </Button>

          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => setRejectOpen(true)}
            className="h-7 text-[11px] bg-rose-600 hover:bg-rose-500 text-white px-2.5 font-medium shadow-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </>
      )}

      {status === "approved" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setVoidOpen(true)}
          className="h-7 text-[11px] border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 px-2.5 font-medium"
        >
          <Ban className="h-3 w-3 mr-1" />
          Void
        </Button>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800 text-neutral-100">
          <DialogHeader>
            <DialogTitle className="text-base text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Reject Pending Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Provide a clear reason for rejecting this payment of RM {(amountSen / 100).toFixed(2)}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRejectConfirm} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-neutral-300 text-xs">Reason for rejection (required)</Label>
              <Input
                type="text"
                placeholder="e.g. Bank slip unreadable or transaction reference not found"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (e.target.value.trim().length >= 5) setRejectError(null);
                }}
                className={`h-9 bg-neutral-950 border-neutral-700 text-xs text-white ${
                  rejectError ? "border-rose-500" : ""
                }`}
              />
              {rejectError && <p className="text-[11px] text-rose-400">{rejectError}</p>}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setRejectOpen(false)}
                className="border-neutral-700 text-neutral-300 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isPending}
                className="text-xs font-semibold bg-rose-600 hover:bg-rose-500"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Rejecting...
                  </>
                ) : (
                  "Confirm Reject"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Void Dialog (Confirmation Step + Reason) */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800 text-neutral-100">
          <DialogHeader>
            <DialogTitle className="text-base text-rose-400 flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Confirm Voiding Approved Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Warning: Voiding will reverse RM {(amountSen / 100).toFixed(2)} and delete all invoice allocations. This action is permanently recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVoidConfirm} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-neutral-300 text-xs">Reason for voiding (required)</Label>
              <Input
                type="text"
                placeholder="e.g. Bounced cheque or payment entry duplicate error"
                value={voidReason}
                onChange={(e) => {
                  setVoidReason(e.target.value);
                  if (e.target.value.trim().length >= 5) setVoidError(null);
                }}
                className={`h-9 bg-neutral-950 border-neutral-700 text-xs text-white ${
                  voidError ? "border-rose-500" : ""
                }`}
              />
              {voidError && <p className="text-[11px] text-rose-400">{voidError}</p>}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setVoidOpen(false)}
                className="border-neutral-700 text-neutral-300 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isPending}
                className="text-xs font-semibold bg-rose-600 hover:bg-rose-500"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Voiding...
                  </>
                ) : (
                  "Confirm Void"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
