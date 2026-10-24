import { prisma } from "../lib/prisma";
import { createLease } from "../lib/leases";
import { recordPayment, approvePayment, rejectPayment, voidPayment } from "../lib/payments";
import { getCollectionsReport } from "../lib/reports";
import { generateSchedule, parseRinggitToSen } from "../lib/billing";
import crypto from "crypto";

async function runApiVerification() {
  console.log("=========================================");
  console.log("🧪 TESTING FULL API & BUSINESS SPECIFICATIONS");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Collections Report Verification
  console.log("1. Collections Report Test (Section 4)");
  const report = await getCollectionsReport("org_northwind", "2026-01", "2026-03");
  const expected = JSON.stringify([
    { month: "2026-01", collectedSen: 300000 },
    { month: "2026-02", collectedSen: 0 },
    { month: "2026-03", collectedSen: 200000 },
  ]);
  assert(JSON.stringify(report) === expected, "Northwind report 2026-01 to 2026-03 matches specification exactly");

  // 2. Overlap Check on Leases (Section 7)
  console.log("\n2. Lease Overlap Prevention Test (Section 7)");
  const unit = await prisma.unit.findFirst({ where: { name: "A-12-3" } });
  const tenant = await prisma.tenant.findFirst({ where: { fullName: "Aisyah Rahman" } });

  let overlapThrown = false;
  try {
    // Aisyah lease is 2026-01-31 to 2026-07-15. Attempt overlapping lease on same unit:
    await createLease({
      orgId: "org_northwind",
      actorId: "11111111-1111-1111-1111-111111111101",
      unitId: unit!.id,
      tenantId: tenant!.id,
      startDate: "2026-05-01",
      endDate: "2026-09-01",
      monthlyRentSen: 150000,
      depositSen: 0,
    });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    overlapThrown = errorObj.status === 409 || (errorObj.message?.includes("overlap") ?? false);
  }
  assert(overlapThrown, "Creating overlapping lease on unit A-12-3 throws 409 conflict");

  // 3. Payment Cap Verification (Section 4)
  console.log("\n3. Payment Cap Test (Section 4)");
  const probeTenant = await prisma.tenant.findFirst({ where: { email: "probe@northwind.test" } });
  const probeLease = await prisma.lease.findFirst({ where: { tenantId: probeTenant!.id } });

  // Probe lease has deposit 400,000 + 12 months x 200,000 = 2,800,000 sen
  let overCapThrown = false;
  try {
    await recordPayment({
      orgId: "org_northwind",
      actorId: "11111111-1111-1111-1111-111111111102", // staff
      role: "staff",
      leaseId: probeLease!.id,
      amountSen: 3000000, // Exceeds cap (2,800,000)
      method: "cash",
      receivedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    overCapThrown = errorObj.status === 422 || (errorObj.message?.includes("exceeds cap") ?? false);
  }
  assert(overCapThrown, "Payment exceeding total lease cap is rejected with 422");

  // 4. Staff Recording (pending_verification) & Manager Approval Lifecycle
  console.log("\n4. Payment Approval & Rejection Lifecycle");
  const staffMember = await prisma.membership.findFirst({ where: { orgId: "org_northwind", role: "staff" } });
  const managerMember = await prisma.membership.findFirst({ where: { orgId: "org_northwind", role: "manager" } });

  const validPayment = await recordPayment({
    orgId: "org_northwind",
    actorId: staffMember!.userId,
    role: "staff",
    leaseId: probeLease!.id,
    amountSen: 400000,
    method: "cash",
    receivedAt: new Date().toISOString(),
  });
  assert(validPayment.status === "pending_verification", "Staff recorded payment is pending_verification");

  // Approve payment
  const approved = await approvePayment({
    orgId: "org_northwind",
    actorId: managerMember!.userId,
    paymentId: validPayment.id,
  });
  assert(approved.status === "approved", "Manager successfully approved payment");

  // Re-approve fails with 409
  let reapproveFails = false;
  try {
    await approvePayment({
      orgId: "org_northwind",
      actorId: managerMember!.userId,
      paymentId: validPayment.id,
    });
  } catch (err: unknown) {
    const errorObj = err as { status?: number };
    reapproveFails = errorObj.status === 409;
  }
  assert(reapproveFails, "Approving already approved payment fails with 409 conflict");

  // Void payment
  const voided = await voidPayment({
    orgId: "org_northwind",
    actorId: managerMember!.userId,
    paymentId: validPayment.id,
    reason: "Check bounced or mistaken entry",
  });
  assert(voided.status === "voided", "Manager successfully voided payment");

  // Allocations removed after void
  const allocs = await prisma.paymentAllocation.findMany({ where: { paymentId: validPayment.id } });
  assert(allocs.length === 0, "Voiding removes that payment's allocations cleanly");

  // Reject test
  const paymentToReject = await recordPayment({
    orgId: "org_northwind",
    actorId: staffMember!.userId,
    role: "staff",
    leaseId: probeLease!.id,
    amountSen: 50000,
    method: "cash",
    receivedAt: new Date().toISOString(),
  });
  const rejected = await rejectPayment({
    orgId: "org_northwind",
    actorId: managerMember!.userId,
    paymentId: paymentToReject.id,
    reason: "Fake currency detected by cashier",
  });
  assert(rejected.status === "rejected", "Manager successfully rejected payment with valid reason");

  let shortReasonFails = false;
  try {
    await rejectPayment({
      orgId: "org_northwind",
      actorId: managerMember!.userId,
      paymentId: paymentToReject.id,
      reason: "No", // < 5 chars
    });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    shortReasonFails = errorObj.status === 400 || (errorObj.message?.includes("5 characters") ?? false);
  }
  assert(shortReasonFails, "Rejecting with reason < 5 characters fails with 400");

  // 5. Audit Log Append-Only Test (Section 6 & 8)
  console.log("\n5. Audit Log Append-Only Constraint Test");
  const auditEntry = await prisma.auditLog.findFirst({ where: { orgId: "org_northwind" } });
  assert(auditEntry !== null, "Audit log contains entries for lease and payment actions");

  let auditDeletePrevented = false;
  try {
    await prisma.$executeRaw`DELETE FROM "audit_log" WHERE id = ${auditEntry!.id}`;
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    auditDeletePrevented = errorObj.message?.includes("audit_log is append-only") ?? false;
  }
  assert(auditDeletePrevented, "Database trigger prevents DELETE on audit_log ('audit_log is append-only')");

  console.log("\n=========================================");
  console.log(`🏁 API TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================\n");

  if (failed > 0) process.exit(1);
}

runApiVerification()
  .catch((e) => {
    console.error("Test failure:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
