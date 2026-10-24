import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, ArrowLeft } from "lucide-react";
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
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-neutral-900 border-neutral-800 text-white">
          <CardHeader>
            <CardTitle className="text-rose-400">Missing Bill Information</CardTitle>
            <CardDescription className="text-neutral-400">No bill ID was provided in the return URL.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="w-full border-neutral-700">Back to Portal</Button>
            </Link>
          </CardContent>
        </Card>
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
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-neutral-900 border-neutral-800 text-white">
          <CardHeader>
            <CardTitle className="text-rose-400">Bill Not Found</CardTitle>
            <CardDescription className="text-neutral-400">The bill ID &quot;{billId}&quot; does not exist in our database.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="w-full border-neutral-700">Back to Portal</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = bill.status === "paid";
  const isFailed = bill.status === "failed";
  const isPending = bill.status === "pending";

  const ringgitAmount = (Number(bill.amountSen) / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 font-sans">
      <Card className="max-w-lg w-full bg-neutral-900 border-neutral-800 text-white shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            {isPaid && (
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            )}
            {isFailed && (
              <div className="h-16 w-16 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400">
                <XCircle className="h-10 w-10" />
              </div>
            )}
            {isPending && (
              <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
                <Clock className="h-10 w-10 animate-pulse" />
              </div>
            )}
          </div>
          <CardTitle className="text-xl">
            {isPaid && "Payment Confirmed & Settled"}
            {isFailed && "Payment Failed"}
            {isPending && "Payment Pending Gateway Confirmation"}
          </CardTitle>
          <CardDescription className="text-neutral-400 text-xs">
            {isPaid && "Your payment has been successfully recorded and allocated to your lease invoices."}
            {isFailed && "The gateway reported a payment failure. No funds were collected."}
            {isPending && "We are awaiting final webhook confirmation from the payment gateway."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4 border-t border-neutral-800/80">
          <div className="bg-neutral-950 p-4 rounded-lg space-y-2.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-500">Bill ID:</span>
              <span className="text-neutral-300 select-all">{bill.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Unit:</span>
              <span className="text-white font-sans">{bill.lease.unit.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Tenant:</span>
              <span className="text-white font-sans">{bill.lease.tenant.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Amount:</span>
              <span className="text-emerald-400 font-bold">RM {ringgitAmount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Database Status:</span>
              <Badge
                variant="outline"
                className={
                  isPaid
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : isFailed
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                }
              >
                {bill.status.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="pt-2">
            <Link href="/">
              <Button className="w-full bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Return to Tenant Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
