import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { invoiceStatus } from "@/lib/billing";
import { MalaysiaTimeDisplay } from "@/components/malaysia-time";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { PaymentActions } from "@/components/payment-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  Receipt,
  CreditCard,
  User,
  Phone,
  Mail,
  FileText,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-400" />
                  Unit {lease.unit.name}
                </h1>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                  {lease.organization.name}
                </Badge>
              </div>
              <p className="text-xs text-neutral-400">Lease ID: {lease.id}</p>
            </div>
          </div>

          {/* Record payment for this lease */}
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

        {/* Lease Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-900 border-neutral-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-neutral-400 font-medium">Tenant Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-base font-bold text-white">{lease.tenant.fullName}</div>
              <div className="text-xs text-neutral-400 mt-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-neutral-500" />
                  <span>{lease.tenant.email}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-emerald-400" />
                  <span className="font-mono">{lease.tenant.phone}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-neutral-400 font-medium">Lease Term (MYT)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold text-white">
                <MalaysiaTimeDisplay date={lease.startDate} /> to{" "}
                <MalaysiaTimeDisplay date={lease.endDate} />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Monthly Rent: RM {(Number(lease.monthlyRentSen) / 100).toFixed(2)}
              </p>
              <p className="text-[11px] text-neutral-500">
                Deposit: RM {(Number(lease.depositSen) / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-neutral-400 font-medium">Total Invoiced</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                RM {(totalInvoiceSen / 100).toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-400 mt-1">
                Total Paid: RM {(totalPaidSen / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-neutral-400 font-medium">Remaining Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-400">
                RM {(remainingBalanceSen / 100).toFixed(2)}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Across all scheduled periods</p>
            </CardContent>
          </Card>
        </div>

        {/* Scheduled Invoices */}
        <Card className="bg-neutral-900 border-neutral-800 text-white">
          <CardHeader className="pb-3 border-b border-neutral-800">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-400" />
              Scheduled Invoices ({invoicesWithStatus.length})
            </CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Generated by billing schedule rules. Invoices are settled in strict order of due date and kind.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-neutral-950">
                  <TableRow className="border-neutral-800 text-xs text-neutral-400">
                    <TableHead className="text-xs">Kind & Period</TableHead>
                    <TableHead className="text-xs">Period Range</TableHead>
                    <TableHead className="text-xs">Due Date (MYT)</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Paid</TableHead>
                    <TableHead className="text-xs">Balance</TableHead>
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
                      <TableCell className="text-neutral-400 font-mono">
                        RM {((inv.amountSen - inv.paidSen) / 100).toFixed(2)}
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
          </CardContent>
        </Card>

        {/* Payments Table */}
        <Card className="bg-neutral-900 border-neutral-800 text-white">
          <CardHeader className="pb-3 border-b border-neutral-800">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-400" />
              Recorded Payments ({lease.payments.length})
            </CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Payments allocated to invoices. Bank transfer slips are stored in Supabase Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {lease.payments.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No payments have been recorded for this lease yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-neutral-950">
                    <TableRow className="border-neutral-800 text-xs text-neutral-400">
                      <TableHead className="text-xs">Payment ID</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Unapplied</TableHead>
                      <TableHead className="text-xs">Received (MYT)</TableHead>
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
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 text-[11px] font-mono border border-blue-500/20"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
