"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseRinggitToSen } from "@/lib/billing";
import { recordPaymentAction } from "@/app/actions/payments";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreditCard, Loader2, Upload, AlertCircle } from "lucide-react";

interface LeaseOption {
  id: string;
  unitName: string;
  tenantName: string;
  monthlyRentSen: number;
}

interface RecordPaymentDialogProps {
  orgId: string;
  actorId: string;
  actorRole: "manager" | "staff";
  leases: LeaseOption[];
  preselectedLeaseId?: string;
  triggerButton?: React.ReactNode;
}

export function RecordPaymentDialog({
  orgId,
  actorId,
  actorRole,
  leases,
  preselectedLeaseId,
  triggerButton,
}: RecordPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedLeaseId, setSelectedLeaseId] = useState(
    preselectedLeaseId || (leases[0]?.id ?? "")
  );
  const [ringgitInput, setRinggitInput] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [slipFile, setSlipFile] = useState<File | null>(null);

  // Malaysia time ISO string for datetime input (YYYY-MM-DDTHH:mm)
  const now = new Date();
  const msInUtc8 = now.getTime() + 8 * 3600 * 1000;
  const initialMyt = new Date(msInUtc8).toISOString().slice(0, 16);
  const [receivedAtMyt, setReceivedAtMyt] = useState(initialMyt);

  // Input validation state
  const [amountError, setAmountError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedSen, setParsedSen] = useState<number | null>(null);

  const handleAmountChange = (val: string) => {
    setRinggitInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setAmountError("Amount is required");
      setParsedSen(null);
      return;
    }

    try {
      const sen = parseRinggitToSen(trimmed);
      setParsedSen(sen);
      setAmountError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid Ringgit format";
      setAmountError(msg);
      setParsedSen(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSlipFile(null);
      setFileError(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFileError("File must be smaller than 5 MB");
      setSlipFile(null);
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setFileError("File must be a JPEG, PNG or PDF");
      setSlipFile(null);
      return;
    }

    setFileError(null);
    setSlipFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!ringgitInput.trim()) {
      setAmountError("Please enter an amount in Ringgit");
      return;
    }

    let calculatedSen = parsedSen;
    if (calculatedSen === null) {
      try {
        calculatedSen = parseRinggitToSen(ringgitInput.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid Ringgit format";
        setAmountError(msg);
        toast.error("Invalid amount", { description: msg });
        return;
      }
    }

    if (method === "bank_transfer" && !slipFile) {
      setFileError("A bank transfer payment requires a slip upload");
      toast.error("Missing slip", { description: "Please upload a transfer slip." });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("orgId", orgId);
      formData.set("actorId", actorId);
      formData.set("role", actorRole);
      formData.set("leaseId", selectedLeaseId);
      formData.set("amountSen", String(calculatedSen));
      formData.set("method", method);

      // Convert local MYT datetime back to ISO timestamp with +08:00
      const isoMyt = `${receivedAtMyt}:00+08:00`;
      formData.set("receivedAt", new Date(isoMyt).toISOString());

      if (method === "bank_transfer" && slipFile) {
        formData.set("slipFile", slipFile);
      }

      const res = await recordPaymentAction(formData);

      if (res.success) {
        toast.success("Payment recorded successfully!", {
          description: `RM ${(calculatedSen! / 100).toFixed(2)} recorded via ${method.replace("_", " ")}. Status: ${actorRole === "manager" ? "Approved" : "Pending verification"}.`,
        });
        setOpen(false);
        setRinggitInput("");
        setParsedSen(null);
        setSlipFile(null);
      } else {
        toast.error("Failed to record payment", {
          description: res.error || "An unexpected error occurred.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (triggerButton as React.ReactElement | undefined) ?? (
            <Button className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all">
              <CreditCard className="h-3.5 w-3.5" />
              Record Payment
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md glass-card border-white/[0.1] text-neutral-100 rounded-3xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2 text-white">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            Record Lease Payment
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Recorded as <span className="text-emerald-400 font-semibold uppercase">{actorRole}</span>.
            {actorRole === "manager"
              ? " Approved immediately and applied to invoices."
              : " Will require manager approval before invoice allocation."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-2">
          {/* Lease Select */}
          <div className="space-y-1.5">
            <Label className="text-neutral-300">Select Lease</Label>
            <select
              value={selectedLeaseId}
              onChange={(e) => setSelectedLeaseId(e.target.value)}
              required
              className="w-full h-9 rounded-md bg-neutral-950 border border-neutral-700 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  Unit {l.unitName} — {l.tenantName} (RM {(l.monthlyRentSen / 100).toFixed(2)}/mo)
                </option>
              ))}
            </select>
          </div>

          {/* Amount in Ringgit */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-neutral-300">Amount in Ringgit (MYR)</Label>
              {parsedSen !== null && (
                <span className="text-[11px] text-emerald-400 font-mono">
                  = {parsedSen.toLocaleString()} sen (RM {(parsedSen / 100).toFixed(2)})
                </span>
              )}
            </div>
            <Input
              type="text"
              placeholder="e.g. 1,500.00 or 1500"
              value={ringgitInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              required
              className={`h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono ${
                amountError ? "border-rose-500 ring-rose-500" : ""
              }`}
            />
            {amountError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {amountError}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-neutral-300">Payment Method</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "cash" | "bank_transfer")}
              className="w-full h-9 rounded-md bg-neutral-950 border border-neutral-700 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer (requires slip upload)</option>
            </select>
          </div>

          {/* Slip Upload (Bank Transfer only) */}
          {method === "bank_transfer" && (
            <div className="space-y-1.5 p-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/60">
              <Label className="text-neutral-300 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-blue-400" />
                Bank Transfer Slip (JPEG, PNG or PDF, max 5 MB)
              </Label>
              <Input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                required
                className="mt-1 h-9 bg-neutral-900 border-neutral-700 text-xs text-neutral-300 file:bg-neutral-800 file:text-white file:border-0 file:rounded file:px-2 file:text-xs"
              />
              {fileError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3 w-3" />
                  {fileError}
                </p>
              )}
            </div>
          )}

          {/* Received At in Malaysia Time */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-neutral-300">Date & Time Received</Label>
              <span className="text-[10px] text-neutral-500 font-mono">Malaysia Time (UTC+8)</span>
            </div>
            <Input
              type="datetime-local"
              value={receivedAtMyt}
              onChange={(e) => setReceivedAtMyt(e.target.value)}
              required
              className="h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="border-neutral-700 text-neutral-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Recording...
                </>
              ) : (
                "Submit Payment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
