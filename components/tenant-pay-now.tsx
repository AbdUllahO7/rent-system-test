"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createTenantGatewayBillAction,
  simulateGatewayPaymentAction,
} from "@/app/actions/gateway";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCard, ExternalLink, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

interface TenantPayNowProps {
  leaseId: string;
  amountDueNowSen: number;
}

export function TenantPayNow({ leaseId, amountDueNowSen }: TenantPayNowProps) {
  const [isPending, startTransition] = useTransition();
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [activeBill, setActiveBill] = useState<{
    id: string;
    amountSen: number;
    status: string;
  } | null>(null);

  const [isSimulating, setIsSimulating] = useState(false);

  const handlePayNow = () => {
    if (amountDueNowSen <= 0) {
      toast.info("No balance due now", {
        description: "All invoices due on or before today are fully settled.",
      });
      return;
    }

    startTransition(async () => {
      const res = await createTenantGatewayBillAction(leaseId);
      if (res.success && res.billId && res.amountSen) {
        toast.success("Online gateway bill generated!", {
          description: `Bill ${res.billId} for RM ${(res.amountSen / 100).toFixed(2)}.`,
        });
        setActiveBill({
          id: res.billId,
          amountSen: res.amountSen,
          status: "pending",
        });
        setBillModalOpen(true);
      } else {
        toast.error("Failed to generate bill", {
          description: res.error || "Please check your lease status.",
        });
      }
    });
  };

  const handleSimulatePayment = async () => {
    if (!activeBill) return;
    setIsSimulating(true);

    try {
      const res = await simulateGatewayPaymentAction(activeBill.id, activeBill.amountSen);
      if (res.success) {
        toast.success("Payment successful via Gateway Webhook!", {
          description: res.message || "Bill settled and allocated to invoices.",
        });
        setActiveBill((prev) => (prev ? { ...prev, status: "paid" } : null));
      } else {
        toast.error("Gateway simulation error", {
          description: res.error || "Webhook failed to settle bill.",
        });
      }
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 gap-3">
        <div>
          <div className="text-xs text-neutral-400 font-medium">Total Amount Due Now</div>
          <div className="text-2xl font-bold text-white mt-0.5 flex items-baseline gap-2">
            <span className={amountDueNowSen > 0 ? "text-emerald-400" : "text-neutral-400"}>
              RM {(amountDueNowSen / 100).toFixed(2)}
            </span>
            <span className="text-xs font-normal text-neutral-400">
              (due on or before today, Malaysia time)
            </span>
          </div>
        </div>

        <Button
          onClick={handlePayNow}
          disabled={isPending || amountDueNowSen <= 0}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 h-9 shadow-md flex items-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Bill...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />
              Pay Now (Online Gateway)
            </>
          )}
        </Button>
      </div>

      {/* Gateway Bill Dialog */}
      <Dialog open={billModalOpen} onOpenChange={setBillModalOpen}>
        <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800 text-neutral-100">
          <DialogHeader>
            <DialogTitle className="text-base text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              Gateway Online Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              In this test environment, you can simulate the gateway webhook call or view the return status page.
            </DialogDescription>
          </DialogHeader>

          {activeBill && (
            <div className="space-y-4 mt-2">
              <div className="p-3.5 rounded-lg border border-neutral-800 bg-neutral-950 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Bill ID:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{activeBill.id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Amount Due:</span>
                  <span className="font-bold text-white">
                    RM {(activeBill.amountSen / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Status:</span>
                  <span
                    className={`font-semibold capitalize px-2 py-0.5 rounded-full text-[11px] ${
                      activeBill.status === "paid"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {activeBill.status}
                  </span>
                </div>
              </div>

              {activeBill.status === "paid" ? (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Bill has been settled and payment allocated to your lease!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleSimulatePayment}
                    disabled={isSimulating}
                    className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    {isSimulating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Simulating Gateway Webhook...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Simulate Payment (Gateway Webhook)
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <Link
                  href={`/payments/return?bill_id=${activeBill.id}&paid=${activeBill.status === "paid"}`}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  <span>Go to Gateway Return Page</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBillModalOpen(false)}
                  className="h-7 text-xs border-neutral-700 text-neutral-300"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
