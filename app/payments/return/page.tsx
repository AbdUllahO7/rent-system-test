import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ bill_id?: string; paid?: string }>;
}) {
  const { bill_id: billId } = await searchParams;

  if (!billId) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full rounded-2xl p-6 border border-white/[0.08] text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <XCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-rose-400">Missing Bill Information</h2>
            <p className="text-xs text-neutral-400 mt-1">No bill ID was provided in the return URL.</p>
          </div>
          <Link href="/">
            <Button variant="outline" className="w-full border-white/[0.1] bg-white/[0.04] text-neutral-200 hover:text-white">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Fetch real status strictly from the database (never trust the query parameter)
  const bill = await prisma.gatewayBill.findUnique({
    where: { id: billId },
    include: {
      lease: {
        include: {
          unit: true,
          tenant: true,
        },
      },
    },
  });

  if (!bill) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full rounded-2xl p-6 border border-white/[0.08] text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <XCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-rose-400">Bill Not Found</h2>
            <p className="text-xs text-neutral-400 mt-1">The bill ID &quot;{billId}&quot; does not exist in our database.</p>
          </div>
          <Link href="/">
            <Button variant="outline" className="w-full border-white/[0.1] bg-white/[0.04] text-neutral-200 hover:text-white">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isPaid = bill.status === "paid";
  const isFailed = bill.status === "failed";
  const isPending = bill.status === "pending";

  const ringgitAmount = (Number(bill.amountSen) / 100).toFixed(2);

  return (
    <div className="min-h-screen text-white flex items-center justify-center p-4 font-sans">
      <div className="glass-card max-w-lg w-full rounded-3xl border border-white/[0.1] shadow-2xl p-8 relative overflow-hidden space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            {isPaid && (
              <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/25 text-emerald-400 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="h-9 w-9" />
              </div>
            )}
            {isFailed && (
              <div className="h-16 w-16 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/25 text-rose-400 shadow-lg shadow-rose-500/20">
                <XCircle className="h-9 w-9" />
              </div>
            )}
            {isPending && (
              <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/25 text-amber-400 shadow-lg shadow-amber-500/20">
                <Clock className="h-9 w-9 animate-pulse" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {isPaid && "Payment Confirmed & Settled"}
              {isFailed && "Payment Failed"}
              {isPending && "Awaiting Webhook Confirmation"}
            </h2>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
              {isPaid && "Your transaction was securely verified. An approved payment has been created and applied to your rental invoices."}
              {isFailed && "The gateway reported a payment failure. No funds were collected from your account."}
              {isPending && "Your transaction is pending final webhook signature confirmation from the gateway."}
            </p>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] p-5 rounded-2xl space-y-3 text-xs font-mono">
          <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
            <span className="text-neutral-500">Bill ID:</span>
            <span className="text-neutral-300 font-semibold select-all">{bill.id}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
            <span className="text-neutral-500">Unit:</span>
            <span className="text-white font-sans font-semibold">Unit {bill.lease.unit.name}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
            <span className="text-neutral-500">Tenant:</span>
            <span className="text-white font-sans">{bill.lease.tenant.fullName}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
            <span className="text-neutral-500">Settled Amount:</span>
            <span className="text-emerald-400 font-bold text-sm">RM {ringgitAmount}</span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-neutral-500">Database Status:</span>
            <Badge
              variant="outline"
              className={`text-xs font-semibold ${
                isPaid
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : isFailed
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              {bill.status.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="pt-2">
          <Link href="/">
            <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all">
              <ArrowLeft className="h-4 w-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
