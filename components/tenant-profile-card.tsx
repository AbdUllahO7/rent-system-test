"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTenantPhoneAction } from "@/app/actions/tenants";
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
import { Phone, Mail, User, Edit3, Loader2 } from "lucide-react";

interface TenantProfileCardProps {
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
}

export function TenantProfileCard({
  tenantId,
  fullName,
  email,
  phone,
}: TenantProfileCardProps) {
  const [open, setOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState(phone);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setPhoneInput(phone);
    setPhoneError(null);
    setOpen(true);
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneError("Phone number cannot be empty.");
      return;
    }

    const clean = trimmed.replace(/\D/g, "");
    if (clean.length < 8) {
      setPhoneError("Please enter a valid phone number (at least 8 digits).");
      return;
    }

    startTransition(async () => {
      const res = await updateTenantPhoneAction(tenantId, trimmed);
      if (res.success) {
        toast.success("Phone number updated successfully!", {
          description: `New phone: ${trimmed}`,
        });
        setOpen(false);
      } else {
        toast.error("Failed to update phone", {
          description: res.error || "An error occurred.",
        });
      }
    });
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-400/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm shadow-md shadow-emerald-500/10">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{fullName}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Verified Tenant
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400 mt-1">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-neutral-500" />
                {email}
              </span>
              <span className="flex items-center gap-1.5 text-neutral-200 font-mono font-medium">
                <Phone className="h-3.5 w-3.5 text-emerald-400" />
                {phone}
              </span>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleOpen}
          className="h-9 px-3.5 rounded-xl text-xs border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 hover:text-white transition-all"
        >
          <Edit3 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
          Edit Phone Number
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md glass-card border-white/[0.1] text-neutral-100 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base text-white flex items-center gap-2">
              <Phone className="h-4 w-4 text-emerald-400" />
              Update Contact Phone Number
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Enter your active mobile or WhatsApp contact number.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePhoneSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-neutral-300 text-xs">Phone Number</Label>
              <Input
                type="text"
                placeholder="+60 12-345 6789"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  if (e.target.value.trim().length >= 8) setPhoneError(null);
                }}
                className={`h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono ${
                  phoneError ? "border-rose-500" : ""
                }`}
              />
              {phoneError && <p className="text-[11px] text-rose-400">{phoneError}</p>}
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
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  "Save Phone Number"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
