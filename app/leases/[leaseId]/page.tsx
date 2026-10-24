import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { invoiceStatus } from "@/lib/billing";
import { MalaysiaTimeDisplay } from "@/components/malaysia-time";
import { formatRinggit } from "@/lib/dates";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { PaymentActions } from "@/components/payment-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Mail,
  Phone,
  Receipt,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const now = new Date();

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      unit: true,
      tenant: true,
      organization: true,
      invoices: {
        include: { allocations: true },
        orderBy: [{ dueDate: "asc" }, { periodIndex: "asc" }],
      },
      payments: {
        orderBy: { receivedAt: "desc" },
      },
    },
  });

  if (!lease) {
    notFound();
  }

  // Find manager member for action permissions
  const managerMember = await prisma.membership.findFirst({
    where: { orgId: lease.orgId, role: "manager" },
  });

  // Calculate invoice statuses
  const invoicesWithStatus = lease.invoices.map((inv) => {
    const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
    const amountSen = Number(inv.amountSen);
    const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
    const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);
    return { ...inv, paidSen, amountSen, status };
  });

  const totalInvoiceSen = invoicesWithStatus.reduce((sum, inv) => sum + inv.amountSen, 0);
  const totalPaidSen = invoicesWithStatus.reduce((sum, inv) => sum + inv.paidSen, 0);
  const remainingBalanceSen = totalInvoiceSen - totalPaidSen;

  return (
    <div className="min-h-screen text-neutral-100 font-sans pb-16">
      {/* Top Floating Glass Navigation */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#090c15]/80 border-b border-white/[0.08] px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3.5 border-white/[0.12] bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-400" />
                  Unit {lease.unit.name}
                </span>
                <span className="text-neutral-500">•</span>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                  {lease.organization.name}
                </Badge>
              </div>
              <p className="text-xs text-neutral-400 font-mono">Lease ID: {lease.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {managerMember && (
              <RecordPaymentDialog
                orgId={lease.orgId}
                actorId={managerMember.userId}
                actorRole="manager"
                leases={[
                  {
                    id: lease.id,
                    unitName: lease.unit.name,
                    tenantName: lease.tenant.fullName,
                    monthlyRentSen: Number(lease.monthlyRentSen),
                  },
                ]}
                preselectedLeaseId={lease.id}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Lease Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Tenant Details */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Tenant Profile
              </span>
              <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <User className="h-4 w-4" />
              </div>
            </div>
            <div className="text-lg font-bold text-white">{lease.tenant.fullName}</div>
            <div className="text-xs text-neutral-400 mt-2 space-y-1">
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="h-3 w-3 text-neutral-500" />
                <span className="truncate">{lease.tenant.email}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-emerald-400">
                <Phone className="h-3 w-3" />
                <span>{lease.tenant.phone}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Lease Term */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Lease Duration (MYT)
              </span>
              <div className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="text-xs font-semibold text-neutral-200 font-mono">
              <MalaysiaTimeDisplay date={lease.startDate} /> → <MalaysiaTimeDisplay date={lease.endDate} />
            </div>
            <div className="text-xs text-neutral-400 mt-2 space-y-0.5">
              <p>Monthly: <strong className="text-white font-mono">RM {formatRinggit(lease.monthlyRentSen)}</strong></p>
              <p>Deposit: <strong className="text-emerald-400 font-mono">RM {formatRinggit(lease.depositSen)}</strong></p>
            </div>
          </div>

          {/* Card 3: Invoiced & Paid */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Total Invoiced
              </span>
              <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              RM {formatRinggit(totalInvoiceSen)}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 mt-2">
              <span>Paid: <strong className="text-emerald-400 font-mono">RM {formatRinggit(totalPaidSen)}</strong></span>
              <span className="text-emerald-400 font-medium text-[11px]">
                {totalInvoiceSen > 0 ? `${Math.round((totalPaidSen / totalInvoiceSen) * 100)}%` : "0%"}
              </span>
            </div>
          </div>

          {/* Card 4: Remaining Balance */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Remaining Balance
              </span>
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-amber-400 font-mono">
              RM {formatRinggit(remainingBalanceSen)}
            </div>
            <div className="text-xs text-neutral-400 mt-2">
              <span>Across all scheduled periods</span>
            </div>
          </div>
        </div>

        {/* Scheduled Invoices */}
        <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-400" />
                Scheduled Invoices ({invoicesWithStatus.length})
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Invoices generated automatically by schedule rules, settled in strict priority order (due_date ASC, deposit before rent).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white/[0.02]">
                <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                  <TableHead className="font-semibold text-neutral-300">Kind & Period</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Period Interval</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Due Date (MYT)</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Invoice Amount</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Paid Amount</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Balance</TableHead>
                  <TableHead className="font-semibold text-neutral-300">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesWithStatus.map((inv) => (
                  <TableRow key={inv.id} className="border-white/[0.06] text-xs hover:bg-white/[0.02]">
                    <TableCell className="font-bold text-white capitalize">
                      {inv.kind} {inv.periodIndex !== null ? `#${inv.periodIndex}` : ""}
                    </TableCell>
                    <TableCell className="text-neutral-400 font-mono text-[11px]">
                      {inv.periodStart && inv.periodEnd ? (
                        <>
                          <MalaysiaTimeDisplay date={inv.periodStart} /> →{" "}
                          <MalaysiaTimeDisplay date={inv.periodEnd} />
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-neutral-300 font-mono">
                      <MalaysiaTimeDisplay date={inv.dueDate} />
                    </TableCell>
                    <TableCell className="font-bold text-white font-mono">
                      RM {formatRinggit(inv.amountSen)}
                    </TableCell>
                    <TableCell className="text-emerald-400 font-mono font-medium">
                      RM {formatRinggit(inv.paidSen)}
                    </TableCell>
                    <TableCell className="text-neutral-400 font-mono">
                      RM {formatRinggit(inv.amountSen - inv.paidSen)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold tracking-wide ${
                          inv.status === "paid"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : inv.status === "overdue"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                            : inv.status === "partially_paid"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            : "border-neutral-700 bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        {inv.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Payments Table */}
        <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-400" />
                Recorded Payments ({lease.payments.length})
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Payment allocations and verification workflow. Slips stored securely in Supabase Storage.
              </p>
            </div>
          </div>

          {lease.payments.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No payments have been recorded for this lease yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-white/[0.02]">
                  <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                    <TableHead className="font-semibold text-neutral-300">ID</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Method</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Amount</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Unapplied</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Received (MYT)</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Status</TableHead>
                    <TableHead className="font-semibold text-neutral-300">Slip Proof</TableHead>
                    <TableHead className="text-right font-semibold text-neutral-300">Manager Workflow</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lease.payments.map((p) => (
                    <TableRow key={p.id} className="border-white/[0.06] text-xs hover:bg-white/[0.02]">
                      <TableCell className="font-mono text-neutral-400">{p.id}</TableCell>
                      <TableCell className="capitalize font-medium text-white">
                        {p.method.replace("_", " ")}
                      </TableCell>
                      <TableCell className="font-bold text-emerald-400 font-mono">
                        RM {formatRinggit(p.amountSen)}
                      </TableCell>
                      <TableCell className="text-neutral-400 font-mono">
                        RM {formatRinggit(p.unappliedSen)}
                      </TableCell>
                      <TableCell className="text-neutral-300 font-mono">
                        <MalaysiaTimeDisplay date={p.receivedAt} type="datetime" />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold tracking-wide ${
                            p.status === "approved"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : p.status === "pending_verification"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {p.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.slipPath ? (
                          <a
                            href={`/api/leases/${lease.id}/payments/${p.id}/slip`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-mono border border-emerald-500/20 transition-all"
                          >
                            <FileText className="h-3 w-3" />
                            <span>View Slip</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {managerMember && (
                          <PaymentActions
                            paymentId={p.id}
                            orgId={lease.orgId}
                            actorId={managerMember.userId}
                            isManager={true}
                            status={p.status as "pending_verification" | "approved" | "rejected" | "voided"}
                            amountSen={Number(p.amountSen)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
