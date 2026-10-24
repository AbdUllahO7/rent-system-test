import React from "react";
import { prisma } from "@/lib/prisma";
import { invoiceStatus } from "@/lib/billing";
import { getCollectionsReport } from "@/lib/reports";
import { MalaysiaTimeDisplay } from "@/components/malaysia-time";
import { CreateLeaseDialog } from "@/components/create-lease-dialog";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { TenantProfileCard } from "@/components/tenant-profile-card";
import { TenantPayNow } from "@/components/tenant-pay-now";
import { PaymentActions } from "@/components/payment-actions";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Clock,
  CreditCard,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
  User,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  Layers,
  ChevronRight,
  Coins,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();

  // 1. Fetch organization details
  const organizations = await prisma.organization.findMany({
    include: {
      units: true,
      tenants: true,
    },
  });

  const activeOrg = organizations[0];
  const orgId = activeOrg?.id ?? "org_northwind";

  // 2. Fetch all leases for this organization
  const leases = await prisma.lease.findMany({
    where: { orgId },
    include: {
      unit: true,
      tenant: true,
      invoices: {
        include: { allocations: true },
        orderBy: [{ dueDate: "asc" }, { periodIndex: "asc" }],
      },
      payments: {
        orderBy: { receivedAt: "desc" },
      },
    },
    orderBy: { startDate: "desc" },
  });

  // 3. Compute overdue invoices count and total outstanding
  let overdueCount = 0;
  let totalOutstandingSen = BigInt(0);
  let totalInvoicesCount = 0;

  for (const lease of leases) {
    for (const inv of lease.invoices) {
      totalInvoicesCount++;
      const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
      const amountSen = Number(inv.amountSen);
      const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
      const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);

      if (status === "overdue") {
        overdueCount++;
      }
      if (status !== "paid") {
        totalOutstandingSen += BigInt(amountSen - paidSen);
      }
    }
  }

  // 4. Collections report for last 6 months in Malaysia time
  const msInUtc8 = now.getTime() + 8 * 3600 * 1000;
  const curUtc8 = new Date(msInUtc8);
  const curY = curUtc8.getUTCFullYear();
  const curM = curUtc8.getUTCMonth() + 1;

  let fromY = curY;
  let fromM = curM - 5;
  if (fromM <= 0) {
    fromM += 12;
    fromY -= 1;
  }
  const fromStr = `${fromY}-${String(fromM).padStart(2, "0")}`;
  const toStr = `${curY}-${String(curM).padStart(2, "0")}`;

  const collectionsReport = await getCollectionsReport(orgId, fromStr, toStr);
  const totalCollectedSen = collectionsReport.reduce((sum, r) => sum + r.collectedSen, 0);
  const maxMonthlyCollection = Math.max(...collectionsReport.map((r) => r.collectedSen), 1);

  // 5. Seed accounts for demonstration
  const managerMember = await prisma.membership.findFirst({
    where: { orgId, role: "manager" },
  });
  const staffMember = await prisma.membership.findFirst({
    where: { orgId, role: "staff" },
  });
  const aisyahTenant = await prisma.tenant.findFirst({
    where: { orgId, fullName: "Aisyah Rahman" },
  });

  // Aisyah lease for tenant view
  const aisyahLease = leases.find((l) => l.tenantId === aisyahTenant?.id) ?? leases[0];

  // Amount due now for Aisyah (invoices due on or before today MYT)
  const todayMytStr = new Date(msInUtc8).toISOString().slice(0, 10);
  let aisyahAmountDueNowSen = 0;
  if (aisyahLease) {
    for (const inv of aisyahLease.invoices) {
      const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
      if (dueDateStr <= todayMytStr) {
        const paid = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
        const rem = Number(inv.amountSen) - paid;
        if (rem > 0) aisyahAmountDueNowSen += rem;
      }
    }
  }

  // Leases list for record payment dialog
  const leaseOptions = leases.map((l) => ({
    id: l.id,
    unitName: l.unit.name,
    tenantName: l.tenant.fullName,
    monthlyRentSen: Number(l.monthlyRentSen),
  }));

  return (
    <div className="min-h-screen text-neutral-100 font-sans pb-16">
      {/* Top Floating Glass Navigation */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#090c15]/80 border-b border-white/[0.08] px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 p-0.5 shadow-lg shadow-emerald-500/25 flex items-center justify-center">
              <div className="h-full w-full bg-[#0b0f19] rounded-[14px] flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  EzyRent
                </span>
                <span className="text-neutral-500 text-sm">/</span>
                <span className="text-sm font-semibold text-neutral-300">
                  {activeOrg?.name ?? "Northwind Properties"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  MYR • UTC+8
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-normal">
                Property Management & Automated Rent Collection Platform
              </p>
            </div>
          </div>

          {/* Timezone Status & Global Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-neutral-300 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-neutral-400">Malaysia Time:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                <MalaysiaTimeDisplay date={now} type="datetime" />
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-neutral-300 hidden sm:flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-neutral-400 font-medium">Postgres RLS</span>
            </div>

            {managerMember && (
              <div className="flex items-center gap-2">
                <CreateLeaseDialog
                  orgId={orgId}
                  actorId={managerMember.userId}
                  units={activeOrg?.units.map((u) => ({ id: u.id, name: u.name })) ?? []}
                  tenants={activeOrg?.tenants.map((t) => ({ id: t.id, fullName: t.fullName })) ?? []}
                />
                <RecordPaymentDialog
                  orgId={orgId}
                  actorId={managerMember.userId}
                  actorRole="manager"
                  leases={leaseOptions}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* KPI Analytics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Overdue Invoices */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all duration-300" />
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Overdue Invoices
              </span>
              <div className="h-8 w-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-rose-400">
              {overdueCount}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 mt-2">
              <span>Past due in Asia/Kuala_Lumpur</span>
              <span className="text-neutral-500 font-mono text-[11px]">
                {totalInvoicesCount > 0
                  ? `${Math.round((overdueCount / totalInvoicesCount) * 100)}% of total`
                  : "0%"}
              </span>
            </div>
          </div>

          {/* Card 2: Total Outstanding Rent */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all duration-300" />
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Outstanding Balance
              </span>
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-amber-300 font-mono">
              RM {(Number(totalOutstandingSen) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 mt-2">
              <span>Unpaid across active leases</span>
              <span className="text-amber-400/80 font-medium text-[11px]">Pending receipts</span>
            </div>
          </div>

          {/* Card 3: Active Leases */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all duration-300" />
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Active Leases
              </span>
              <div className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-white">
              {leases.length}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 mt-2">
              <span>{activeOrg?.units.length ?? 0} total properties managed</span>
              <span className="text-emerald-400 font-semibold text-[11px]">Occupancy High</span>
            </div>
          </div>

          {/* Card 4: 6-Month Collections */}
          <div className="glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-300" />
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                6-Month Collections
              </span>
              <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-emerald-400 font-mono">
              RM {(totalCollectedSen / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 mt-2">
              <span>Approved received_at (MYT)</span>
              <span className="text-neutral-500 font-mono text-[11px]">{fromStr} ~ {toStr}</span>
            </div>
          </div>
        </div>

        {/* Collections Breakdown Visual Histogram Card */}
        <div className="glass-card rounded-2xl p-6 border border-white/[0.08] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-6 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Collections Report Breakdown ({fromStr} to {toStr})
                </h3>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Approved payments aggregated strictly by the calendar month of received_at in Malaysia time (UTC+8).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5 text-xs font-mono">
                GET /api/reports/collections
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 pt-6">
            {collectionsReport.map((col) => {
              const heightPercent = Math.max(Math.round((col.collectedSen / maxMonthlyCollection) * 100), 12);
              const isPositive = col.collectedSen > 0;
              return (
                <div
                  key={col.month}
                  className={`rounded-xl p-4 border transition-all duration-200 flex flex-col justify-between h-40 ${
                    isPositive
                      ? "bg-gradient-to-b from-emerald-950/20 to-neutral-900/60 border-emerald-500/20 hover:border-emerald-500/40"
                      : "bg-neutral-900/40 border-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-neutral-300">{col.month}</span>
                    {isPositive ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-neutral-600" />
                    )}
                  </div>

                  {/* Visual Bar Indicator */}
                  <div className="w-full bg-white/[0.04] rounded-full h-2 my-auto overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isPositive ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-neutral-700"
                      }`}
                      style={{ width: `${heightPercent}%` }}
                    />
                  </div>

                  <div>
                    <div
                      className={`text-sm font-extrabold font-mono tracking-tight ${
                        isPositive ? "text-emerald-300" : "text-neutral-500"
                      }`}
                    >
                      RM {(col.collectedSen / 100).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-medium">
                      {isPositive ? "Verified collection" : "0.00 MYR"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Role Segmented Tabs */}
        <Tabs defaultValue="manager" className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="bg-[#0e121d] border border-white/[0.08] p-1 rounded-xl h-auto">
              <TabsTrigger
                value="manager"
                className="text-xs font-semibold px-4 py-2 rounded-lg data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 data-[state=active]:border data-[state=active]:border-emerald-500/30 transition-all flex items-center gap-2"
              >
                <Building2 className="h-3.5 w-3.5" />
                Staff & Manager Console
              </TabsTrigger>
              <TabsTrigger
                value="tenant"
                className="text-xs font-semibold px-4 py-2 rounded-lg data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 data-[state=active]:border data-[state=active]:border-emerald-500/30 transition-all flex items-center gap-2"
              >
                <User className="h-3.5 w-3.5" />
                Tenant Portal ({aisyahTenant?.fullName ?? "Aisyah Rahman"})
              </TabsTrigger>
            </TabsList>

            <div className="text-xs text-neutral-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Signed in as: <strong className="text-white">manager@northwind.test</strong> (Manager)</span>
            </div>
          </div>

          {/* TAB 1: STAFF & MANAGER CONSOLE */}
          <TabsContent value="manager" className="space-y-6 m-0">
            {/* Leases Summary Table */}
            <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-400" />
                    All Leases ({leases.length})
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select any lease to view invoice schedules, received payments, uploaded slips, and approval actions.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/[0.02]">
                    <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                      <TableHead className="font-semibold text-neutral-300">Unit</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Tenant Name</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Lease Period (MYT)</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Monthly Rent</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Deposit</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Invoices</TableHead>
                      <TableHead className="font-semibold text-neutral-300">Payments</TableHead>
                      <TableHead className="text-right font-semibold text-neutral-300">Detail View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leases.map((l) => (
                      <TableRow key={l.id} className="border-white/[0.06] text-xs hover:bg-white/[0.03] transition-colors">
                        <TableCell className="font-bold text-white">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            Unit {l.unit.name}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-neutral-200">
                          {l.tenant.fullName}
                        </TableCell>
                        <TableCell className="text-neutral-400 font-mono text-[11px]">
                          <MalaysiaTimeDisplay date={l.startDate} /> → <MalaysiaTimeDisplay date={l.endDate} />
                        </TableCell>
                        <TableCell className="font-bold font-mono text-white">
                          RM {(Number(l.monthlyRentSen) / 100).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-bold font-mono text-emerald-400">
                          RM {(Number(l.depositSen) / 100).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-neutral-300">
                          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px]">
                            {l.invoices.length} invoices
                          </span>
                        </TableCell>
                        <TableCell className="text-neutral-300">
                          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px]">
                            {l.payments.length} payments
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/leases/${l.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-all"
                            >
                              View Lease
                              <ArrowUpRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Individual Detailed Lease Cards */}
            {leases.map((lease) => {
              const invoicesWithStatus = lease.invoices.map((inv) => {
                const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
                const amountSen = Number(inv.amountSen);
                const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
                const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);
                return { ...inv, paidSen, amountSen, status };
              });

              return (
                <div key={lease.id} className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                  <div className="p-5 border-b border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/[0.01]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-lg font-extrabold text-white">
                          Unit {lease.unit.name}
                        </h4>
                        <span className="text-neutral-400 text-sm">
                          • Tenant: <strong className="text-neutral-200">{lease.tenant.fullName}</strong>
                        </span>
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                          {lease.id}
                        </Badge>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        Term: <MalaysiaTimeDisplay date={lease.startDate} /> to{" "}
                        <MalaysiaTimeDisplay date={lease.endDate} /> • Rent: <span className="text-white font-mono font-semibold">RM {(Number(lease.monthlyRentSen) / 100).toFixed(2)}/mo</span> • Deposit: <span className="text-emerald-400 font-mono font-semibold">RM {(Number(lease.depositSen) / 100).toFixed(2)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/leases/${lease.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-white/[0.12] bg-white/[0.03] text-neutral-200 hover:text-white"
                        >
                          Dedicated Page
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="p-5 space-y-6">
                    {/* Invoices List */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                          Generated Invoices Schedule ({invoicesWithStatus.length})
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                        <Table>
                          <TableHeader className="bg-white/[0.02]">
                            <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                              <TableHead className="font-semibold text-neutral-300">Kind / Period</TableHead>
                              <TableHead className="font-semibold text-neutral-300">Period Interval</TableHead>
                              <TableHead className="font-semibold text-neutral-300">Due Date (MYT)</TableHead>
                              <TableHead className="font-semibold text-neutral-300">Invoice Amount</TableHead>
                              <TableHead className="font-semibold text-neutral-300">Paid Amount</TableHead>
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
                                  RM {(inv.amountSen / 100).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-emerald-400 font-mono font-semibold">
                                  RM {(inv.paidSen / 100).toFixed(2)}
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

                    {/* Payments List */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                          Recorded Payments & Manager Approval Center ({lease.payments.length})
                        </span>
                      </div>

                      {lease.payments.length === 0 ? (
                        <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.01] text-xs text-neutral-500 text-center">
                          No payments recorded yet for this lease.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
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
                                    RM {(Number(p.amountSen) / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-neutral-400 font-mono">
                                    RM {(Number(p.unappliedSen) / 100).toFixed(2)}
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
                                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] underline underline-offset-2"
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
                                        orgId={orgId}
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
                  </div>
                </div>
              );
            })}
          </TabsContent>

          {/* TAB 2: TENANT PORTAL */}
          <TabsContent value="tenant" className="space-y-6 m-0">
            {aisyahTenant && (
              <div className="glass-card rounded-2xl p-6 border border-white/[0.08]">
                <TenantProfileCard
                  tenantId={aisyahTenant.id}
                  fullName={aisyahTenant.fullName}
                  email={aisyahTenant.email}
                  phone={aisyahTenant.phone}
                />
              </div>
            )}

            {aisyahLease && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col: Digital Payment Pass Card */}
                <div className="lg:col-span-1">
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white shadow-xl shadow-emerald-950/40 relative overflow-hidden flex flex-col justify-between h-full min-h-[300px]">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-widest text-emerald-200 font-bold">
                          EzyRent Payment Pass
                        </span>
                        <Building2 className="h-5 w-5 text-emerald-200" />
                      </div>
                      <h4 className="text-xl font-black tracking-tight pt-2">
                        Unit {aisyahLease.unit.name}
                      </h4>
                      <p className="text-xs text-emerald-100/80">
                        {activeOrg?.name ?? "Northwind Properties"}
                      </p>
                    </div>

                    <div className="py-6">
                      <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider block">
                        Amount Due Now (MYT Today)
                      </span>
                      <div className="text-3xl font-extrabold font-mono mt-1 text-white">
                        RM {(aisyahAmountDueNowSen / 100).toFixed(2)}
                      </div>
                      <span className="text-[11px] text-emerald-100/70 mt-1 block">
                        Includes all unpaid invoices due on or before today
                      </span>
                    </div>

                    <div>
                      <TenantPayNow
                        leaseId={aisyahLease.id}
                        amountDueNowSen={aisyahAmountDueNowSen}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Col: Invoices & Past Payments */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Tenant's Invoices Table */}
                  <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                    <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-emerald-400" />
                        My Rental Invoices
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-white/[0.02]">
                          <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                            <TableHead>Period</TableHead>
                            <TableHead>Due Date (MYT)</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Paid</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aisyahLease.invoices.map((inv) => {
                            const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
                            const amountSen = Number(inv.amountSen);
                            const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
                            const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);

                            return (
                              <TableRow key={inv.id} className="border-white/[0.06] text-xs">
                                <TableCell className="font-semibold text-white capitalize">
                                  {inv.kind} {inv.periodIndex !== null ? `#${inv.periodIndex}` : ""}
                                </TableCell>
                                <TableCell className="text-neutral-300 font-mono">
                                  <MalaysiaTimeDisplay date={inv.dueDate} />
                                </TableCell>
                                <TableCell className="font-bold text-white font-mono">
                                  RM {(amountSen / 100).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-emerald-400 font-mono font-medium">
                                  RM {(paidSen / 100).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-semibold ${
                                      status === "paid"
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                        : status === "overdue"
                                        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                    }`}
                                  >
                                    {status.toUpperCase()}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Tenant's Payments History */}
                  <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                    <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-blue-400" />
                        My Payment History
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-white/[0.02]">
                          <TableRow className="border-white/[0.06] text-xs text-neutral-400">
                            <TableHead>Payment ID</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date Received (MYT)</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aisyahLease.payments.map((p) => (
                            <TableRow key={p.id} className="border-white/[0.06] text-xs">
                              <TableCell className="font-mono text-neutral-400">{p.id}</TableCell>
                              <TableCell className="capitalize text-white">{p.method.replace("_", " ")}</TableCell>
                              <TableCell className="font-bold text-emerald-400 font-mono">
                                RM {(Number(p.amountSen) / 100).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-neutral-300 font-mono">
                                <MalaysiaTimeDisplay date={p.receivedAt} type="datetime" />
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-semibold ${
                                    p.status === "approved"
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                      : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                  }`}
                                >
                                  {p.status.toUpperCase()}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
