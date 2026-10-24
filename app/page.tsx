import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { invoiceStatus } from "@/lib/billing";
import { getCollectionsReport } from "@/lib/reports";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/dates";
import { MalaysiaTimeDisplay } from "@/components/malaysia-time";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { CreateLeaseDialog } from "@/components/create-lease-dialog";
import { PaymentActions } from "@/components/payment-actions";
import { TenantProfileCard } from "@/components/tenant-profile-card";
import { TenantPayNow } from "@/components/tenant-pay-now";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Receipt,
  CreditCard,
  Users,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  FileText,
  ExternalLink,
  ArrowUpRight,
  Clock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  // 1. Fetch organizations
  const organizations = await prisma.organization.findMany({
    include: {
      units: true,
      memberships: true,
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

  for (const lease of leases) {
    for (const inv of lease.invoices) {
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-neutral-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-neutral-950 font-bold shadow-lg shadow-emerald-500/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              {activeOrg?.name ?? "Northwind Properties"}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                MYR (RM) • Asia/Kuala_Lumpur
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Malaysian Rent Collection, Invoices, Gateway & Role-Based Access Platform
            </p>
          </div>
        </div>

        {/* Timezone & Security status */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-400" />
            <span>MYT Time: </span>
            <span className="text-emerald-400 font-semibold">
              <MalaysiaTimeDisplay date={now} type="datetime" />
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
            <span>PostgreSQL RLS Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-neutral-400">Overdue Invoices</CardTitle>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-rose-400">
                {overdueCount} Overdue
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Calculated in Malaysia time</p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-neutral-400">Outstanding Rent</CardTitle>
              <Receipt className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-amber-400">
                RM {(Number(totalOutstandingSen) / 100).toFixed(2)}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Total unpaid balance across leases</p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-neutral-400">Active Leases</CardTitle>
              <Building2 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{leases.length} Leases</div>
              <p className="text-[11px] text-neutral-500 mt-1">
                {activeOrg?.units.length ?? 0} total units managed
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-neutral-400">
                Collections (Last 6 Mos)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-emerald-400">
                RM {(collectionsReport.reduce((sum, r) => sum + r.collectedSen, 0) / 100).toFixed(2)}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">{fromStr} to {toStr}</p>
            </CardContent>
          </Card>
        </div>

        {/* 6-Month Collections Report Display */}
        <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
          <CardHeader className="pb-3 border-b border-neutral-800/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Collections Report (Last 6 Months: {fromStr} to {toStr})
                </CardTitle>
                <CardDescription className="text-xs text-neutral-400">
                  Approved collections aggregated strictly by calendar month of received_at in Malaysia time.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px] border-neutral-700 text-neutral-400">
                API: /api/reports/collections
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {collectionsReport.map((col) => (
                <div
                  key={col.month}
                  className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center"
                >
                  <div className="text-xs font-mono text-neutral-400">{col.month}</div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      col.collectedSen > 0 ? "text-emerald-400" : "text-neutral-500"
                    }`}
                  >
                    RM {(col.collectedSen / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {col.collectedSen > 0 ? "Collected" : "No collections"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Multi-Role Tabs */}
        <Tabs defaultValue="manager" className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
            <TabsList className="bg-neutral-900 border border-neutral-800 p-1">
              <TabsTrigger
                value="manager"
                className="text-xs data-[state=active]:bg-neutral-800 text-neutral-300"
              >
                Staff & Manager Dashboard
              </TabsTrigger>
              <TabsTrigger
                value="tenant"
                className="text-xs data-[state=active]:bg-neutral-800 text-neutral-300"
              >
                Tenant Portal ({aisyahTenant?.fullName ?? "Tenant"})
              </TabsTrigger>
            </TabsList>

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

          {/* Tab 1: Staff & Manager Dashboard */}
          <TabsContent value="manager" className="space-y-6 mt-4">
            {/* List of Leases Overview */}
            <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
              <CardHeader className="pb-3 border-b border-neutral-800/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-400" />
                  List of Leases ({leases.length})
                </CardTitle>
                <CardDescription className="text-xs text-neutral-400">
                  Click any lease to view its complete scheduled invoices, recorded payments, slip verification, and approval workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-neutral-950">
                      <TableRow className="border-neutral-800 text-xs text-neutral-400">
                        <TableHead className="text-xs">Unit Name</TableHead>
                        <TableHead className="text-xs">Tenant</TableHead>
                        <TableHead className="text-xs">Term (MYT)</TableHead>
                        <TableHead className="text-xs">Monthly Rent</TableHead>
                        <TableHead className="text-xs">Deposit</TableHead>
                        <TableHead className="text-xs">Invoices</TableHead>
                        <TableHead className="text-xs">Payments</TableHead>
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leases.map((l) => (
                        <TableRow key={l.id} className="border-neutral-800 text-xs hover:bg-neutral-800/40">
                          <TableCell className="font-semibold text-white">
                            Unit {l.unit.name}
                          </TableCell>
                          <TableCell className="text-neutral-300">
                            {l.tenant.fullName}
                          </TableCell>
                          <TableCell className="text-neutral-400">
                            <MalaysiaTimeDisplay date={l.startDate} /> to{" "}
                            <MalaysiaTimeDisplay date={l.endDate} />
                          </TableCell>
                          <TableCell className="font-mono text-white">
                            RM {(Number(l.monthlyRentSen) / 100).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-emerald-400">
                            RM {(Number(l.depositSen) / 100).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-neutral-400">
                            {l.invoices.length} invoices
                          </TableCell>
                          <TableCell className="text-neutral-400">
                            {l.payments.length} payments
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/leases/${l.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-neutral-700 hover:bg-neutral-800 text-blue-400"
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
              </CardContent>
            </Card>

            {/* Individual Lease Details Expanded on Dashboard */}
            {leases.map((lease) => {
              const invoicesWithStatus = lease.invoices.map((inv) => {
                const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
                const amountSen = Number(inv.amountSen);
                const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
                const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);
                return { ...inv, paidSen, amountSen, status };
              });

              return (
                <Card key={lease.id} className="bg-neutral-900 border-neutral-800 shadow-xs">
                  <CardHeader className="pb-3 border-b border-neutral-800/60">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base text-white flex items-center gap-2">
                          <span>Unit {lease.unit.name}</span>
                          <span className="text-xs text-neutral-400 font-normal">
                            ({lease.tenant.fullName})
                          </span>
                        </CardTitle>
                        <CardDescription className="text-xs text-neutral-400">
                          Term: <MalaysiaTimeDisplay date={lease.startDate} /> to{" "}
                          <MalaysiaTimeDisplay date={lease.endDate} /> • Monthly: RM{" "}
                          {(Number(lease.monthlyRentSen) / 100).toFixed(2)} • Deposit: RM{" "}
                          {(Number(lease.depositSen) / 100).toFixed(2)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/leases/${lease.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-neutral-700 bg-neutral-950 text-neutral-300"
                          >
                            Open Lease Page
                            <ExternalLink className="h-3 w-3 ml-1.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="p-4 space-y-4">
                      {/* Invoices Table */}
                      <div>
                        <h4 className="text-xs font-semibold text-neutral-300 mb-2 flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                          Invoices ({invoicesWithStatus.length})
                        </h4>
                        <div className="rounded-md border border-neutral-800 overflow-hidden">
                          <Table>
                            <TableHeader className="bg-neutral-950">
                              <TableRow className="border-neutral-800 text-xs text-neutral-400">
                                <TableHead className="text-xs">Kind / Period</TableHead>
                                <TableHead className="text-xs">Period Dates</TableHead>
                                <TableHead className="text-xs">Due Date (MYT)</TableHead>
                                <TableHead className="text-xs">Amount</TableHead>
                                <TableHead className="text-xs">Paid</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {invoicesWithStatus.map((inv) => (
                                <TableRow key={inv.id} className="border-neutral-800 text-xs">
                                  <TableCell className="font-semibold text-white capitalize">
                                    {inv.kind} {inv.periodIndex !== null ? `#${inv.periodIndex}` : ""}
                                  </TableCell>
                                  <TableCell className="text-neutral-400">
                                    {inv.periodStart && inv.periodEnd ? (
                                      <>
                                        <MalaysiaTimeDisplay date={inv.periodStart} /> to{" "}
                                        <MalaysiaTimeDisplay date={inv.periodEnd} />
                                      </>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-neutral-300 font-mono">
                                    <MalaysiaTimeDisplay date={inv.dueDate} />
                                  </TableCell>
                                  <TableCell className="font-semibold text-white">
                                    RM {(inv.amountSen / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-emerald-400 font-medium">
                                    RM {(inv.paidSen / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={
                                        inv.status === "paid"
                                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                          : inv.status === "overdue"
                                          ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                          : inv.status === "partially_paid"
                                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                          : "border-neutral-700 bg-neutral-800 text-neutral-300"
                                      }
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
                      <div>
                        <h4 className="text-xs font-semibold text-neutral-300 mb-2 flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                          Recorded Payments ({lease.payments.length})
                        </h4>
                        {lease.payments.length === 0 ? (
                          <div className="p-4 rounded-md border border-neutral-800 bg-neutral-950 text-xs text-neutral-500 text-center">
                            No payments recorded yet for this lease.
                          </div>
                        ) : (
                          <div className="rounded-md border border-neutral-800 overflow-hidden">
                            <Table>
                              <TableHeader className="bg-neutral-950">
                                <TableRow className="border-neutral-800 text-xs text-neutral-400">
                                  <TableHead className="text-xs">Payment ID</TableHead>
                                  <TableHead className="text-xs">Method</TableHead>
                                  <TableHead className="text-xs">Amount</TableHead>
                                  <TableHead className="text-xs">Unapplied</TableHead>
                                  <TableHead className="text-xs">Received At (MYT)</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                  <TableHead className="text-xs">Slip / Document</TableHead>
                                  <TableHead className="text-xs text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lease.payments.map((p) => (
                                  <TableRow key={p.id} className="border-neutral-800 text-xs">
                                    <TableCell className="font-mono text-neutral-400">{p.id}</TableCell>
                                    <TableCell className="capitalize text-white">
                                      {p.method.replace("_", " ")}
                                    </TableCell>
                                    <TableCell className="font-semibold text-emerald-400">
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
                                        className={
                                          p.status === "approved"
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                            : p.status === "pending_verification"
                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                        }
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
                                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-mono text-[11px] hover:underline"
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
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Tab 2: Tenant Portal */}
          <TabsContent value="tenant" className="space-y-6 mt-4">
            {aisyahTenant && (
              <TenantProfileCard
                tenantId={aisyahTenant.id}
                fullName={aisyahTenant.fullName}
                email={aisyahTenant.email}
                phone={aisyahTenant.phone}
              />
            )}

            {aisyahLease && (
              <>
                {/* Pay Now Section */}
                <TenantPayNow
                  leaseId={aisyahLease.id}
                  amountDueNowSen={aisyahAmountDueNowSen}
                />

                {/* Lease Details Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                    <div className="text-xs text-neutral-400">Leased Unit</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      Unit {aisyahLease.unit.name}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Term: <MalaysiaTimeDisplay date={aisyahLease.startDate} /> to{" "}
                      <MalaysiaTimeDisplay date={aisyahLease.endDate} />
                    </div>
                  </div>
                  <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                    <div className="text-xs text-neutral-400">Monthly Rent</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      RM {(Number(aisyahLease.monthlyRentSen) / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">Due on 1st of each period</div>
                  </div>
                  <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                    <div className="text-xs text-neutral-400">Deposit Amount</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">
                      RM {(Number(aisyahLease.depositSen) / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">Refundable security deposit</div>
                  </div>
                </div>

                {/* Tenant Invoices */}
                <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
                  <CardHeader className="pb-3 border-b border-neutral-800/60">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-emerald-400" />
                      My Invoices & Payment Status
                    </CardTitle>
                    <CardDescription className="text-xs text-neutral-400">
                      Invoices for your tenancy. Only invoices due on or before today count toward amount due now.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-neutral-950">
                          <TableRow className="border-neutral-800 text-xs text-neutral-400">
                            <TableHead className="text-xs">Invoice Kind</TableHead>
                            <TableHead className="text-xs">Period</TableHead>
                            <TableHead className="text-xs">Due Date (MYT)</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Paid</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aisyahLease.invoices.map((inv) => {
                            const paidSen = inv.allocations.reduce((sum, a) => sum + Number(a.amountSen), 0);
                            const amountSen = Number(inv.amountSen);
                            const dueDateStr = new Date(inv.dueDate).toISOString().slice(0, 10);
                            const status = invoiceStatus({ dueDate: dueDateStr, amountSen, paidSen }, now);

                            return (
                              <TableRow key={inv.id} className="border-neutral-800 text-xs">
                                <TableCell className="font-semibold text-white capitalize">
                                  {inv.kind} {inv.periodIndex !== null ? `#${inv.periodIndex}` : ""}
                                </TableCell>
                                <TableCell className="text-neutral-400">
                                  {inv.periodStart && inv.periodEnd ? (
                                    <>
                                      <MalaysiaTimeDisplay date={inv.periodStart} /> to{" "}
                                      <MalaysiaTimeDisplay date={inv.periodEnd} />
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="text-neutral-300 font-mono">
                                  <MalaysiaTimeDisplay date={inv.dueDate} />
                                </TableCell>
                                <TableCell className="font-semibold text-white">
                                  RM {(amountSen / 100).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-emerald-400 font-medium">
                                  RM {(paidSen / 100).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      status === "paid"
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                        : status === "overdue"
                                        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                        : status === "partially_paid"
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                        : "border-neutral-700 bg-neutral-800 text-neutral-300"
                                    }
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
                  </CardContent>
                </Card>

                {/* Tenant Payments History */}
                <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xs">
                  <CardHeader className="pb-3 border-b border-neutral-800/60">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-400" />
                      Payment History
                    </CardTitle>
                    <CardDescription className="text-xs text-neutral-400">
                      All payments received and verified for this tenancy.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {aisyahLease.payments.length === 0 ? (
                      <div className="p-6 text-center text-xs text-neutral-500">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-neutral-950">
                            <TableRow className="border-neutral-800 text-xs text-neutral-400">
                              <TableHead className="text-xs">Payment ID</TableHead>
                              <TableHead className="text-xs">Method</TableHead>
                              <TableHead className="text-xs">Amount</TableHead>
                              <TableHead className="text-xs">Received (MYT)</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {aisyahLease.payments.map((p) => (
                              <TableRow key={p.id} className="border-neutral-800 text-xs">
                                <TableCell className="font-mono text-neutral-400">{p.id}</TableCell>
                                <TableCell className="capitalize text-white">
                                  {p.method.replace("_", " ")}
                                </TableCell>
                                <TableCell className="font-semibold text-emerald-400">
                                  RM {(Number(p.amountSen) / 100).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-neutral-300 font-mono">
                                  <MalaysiaTimeDisplay date={p.receivedAt} type="datetime" />
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      p.status === "approved"
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                        : p.status === "pending_verification"
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                    }
                                  >
                                    {p.status.toUpperCase()}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
