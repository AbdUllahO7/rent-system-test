"use client";

import React, { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { generateSchedule, parseRinggitToSen, ScheduledInvoice } from "@/lib/billing";
import { createLeaseAction } from "@/app/actions/leases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Calendar, AlertCircle, Loader2, Receipt } from "lucide-react";

interface UnitOption {
  id: string;
  name: string;
}

interface TenantOption {
  id: string;
  fullName: string;
}

interface CreateLeaseDialogProps {
  orgId: string;
  actorId: string;
  units: UnitOption[];
  tenants: TenantOption[];
}

export function CreateLeaseDialog({
  orgId,
  actorId,
  units,
  tenants,
}: CreateLeaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2027-07-31");
  const [monthlyRentInput, setMonthlyRentInput] = useState("2,000.00");
  const [depositInput, setDepositInput] = useState("4,000.00");

  // Real-time parsed schedule preview
  const preview = useMemo(() => {
    try {
      if (!startDate || !endDate || !monthlyRentInput) {
        return { schedule: [] as ScheduledInvoice[], error: null };
      }
      const monthlyRentSen = parseRinggitToSen(monthlyRentInput);
      const depositSen = depositInput ? parseRinggitToSen(depositInput) : 0;

      const schedule = generateSchedule({
        startDate,
        endDate,
        monthlyRentSen,
        depositSen,
      });

      return { schedule, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid parameters";
      return { schedule: [] as ScheduledInvoice[], error: msg };
    }
  }, [startDate, endDate, monthlyRentInput, depositInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (preview.error || preview.schedule.length === 0) {
      toast.error("Invalid lease parameters", { description: preview.error ?? "Please check inputs." });
      return;
    }

    startTransition(async () => {
      const monthlyRentSen = parseRinggitToSen(monthlyRentInput);
      const depositSen = depositInput ? parseRinggitToSen(depositInput) : 0;

      const res = await createLeaseAction({
        orgId,
        actorId,
        unitId,
        tenantId,
        startDate,
        endDate,
        monthlyRentSen,
        depositSen,
      });

      if (res.success) {
        toast.success("Lease created successfully!", {
          description: `Created lease ${res.id} with ${preview.schedule.length} scheduled invoices.`,
        });
        setOpen(false);
      } else {
        toast.error("Failed to create lease", {
          description: res.error ?? "An error occurred.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="h-9 px-3.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            Create Lease
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl glass-card border-white/[0.1] text-neutral-100 max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-400" />
            Create New Lease & Live Schedule Preview
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Configure lease terms. The billing engine will automatically generate the required deposit and monthly rent schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-300">Unit</Label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                required
                className="w-full h-9 rounded-md bg-neutral-950 border border-neutral-700 px-3 text-xs text-white"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Tenant</Label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                className="w-full h-9 rounded-md bg-neutral-950 border border-neutral-700 px-3 text-xs text-white"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Start Date (YYYY-MM-DD)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">End Date (inclusive)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Monthly Rent (RM)</Label>
              <Input
                type="text"
                placeholder="2,000.00"
                value={monthlyRentInput}
                onChange={(e) => setMonthlyRentInput(e.target.value)}
                required
                className="h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Security Deposit (RM)</Label>
              <Input
                type="text"
                placeholder="4,000.00"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                className="h-9 bg-neutral-950 border-neutral-700 text-xs text-white font-mono"
              />
            </div>
          </div>

          {preview.error ? (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{preview.error}</span>
            </div>
          ) : (
            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                  Live Generated Schedule Preview ({preview.schedule.length} Invoices)
                </span>
                <span className="text-emerald-400 font-mono">
                  Total: RM{" "}
                  {(
                    preview.schedule.reduce((sum, s) => sum + s.amountSen, 0) / 100
                  ).toFixed(2)}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-neutral-900 text-neutral-400 font-mono sticky top-0">
                    <tr>
                      <th className="p-1.5">Kind</th>
                      <th className="p-1.5">Period Start - End</th>
                      <th className="p-1.5">Due Date</th>
                      <th className="p-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 font-mono">
                    {preview.schedule.map((s, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/40">
                        <td className="p-1.5 capitalize text-white">
                          {s.kind} {s.periodIndex !== null ? `#${s.periodIndex}` : ""}
                        </td>
                        <td className="p-1.5 text-neutral-400">
                          {s.periodStart && s.periodEnd ? `${s.periodStart} to ${s.periodEnd}` : "—"}
                        </td>
                        <td className="p-1.5 text-neutral-300">{s.dueDate}</td>
                        <td className="p-1.5 text-right text-emerald-400 font-semibold">
                          RM {(s.amountSen / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-neutral-800 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="text-xs border-neutral-700 text-neutral-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !!preview.error || preview.schedule.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Creating Lease...
                </>
              ) : (
                "Confirm & Create Lease"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
