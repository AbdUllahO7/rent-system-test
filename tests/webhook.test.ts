import { prisma } from "../lib/prisma";
import crypto from "crypto";

async function runWebhookTests() {
  console.log("=========================================");
  console.log("🧪 TESTING GATEWAY WEBHOOK (SECTION 5)");
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

  const secretKey = process.env.GATEWAY_X_SIGNATURE_KEY || "test_x_signature_key";
  const baseUrl = "http://localhost:3000/api/webhooks/gateway";

  // Helper to generate signed payload
  function signFields(fields: Record<string, string>) {
    const sorted = Object.keys(fields).sort();
    const source = sorted.map((k) => `${k}${fields[k]}`).join("|");
    const sig = crypto.createHmac("sha256", secretKey).update(source).digest("hex");
    return { ...fields, x_signature: sig };
  }

  // 1. Create a test bill in Northwind
  const lease = await prisma.lease.findFirst({ where: { orgId: "org_northwind" } });
  const testBillId = `bill_test_${Date.now()}`;
  await prisma.gatewayBill.create({
    data: {
      id: testBillId,
      orgId: "org_northwind",
      leaseId: lease!.id,
      amountSen: BigInt(150000),
      status: "pending",
    },
  });

  // Test 1: Forged / Wrong signature -> 401
  const badSigPayload = new URLSearchParams({
    id: testBillId,
    paid: "true",
    paid_amount: "150000",
    paid_at: "2026-04-01 00:30:12 +0800",
    transaction_id: "TX-TEST-01",
    transaction_status: "completed",
    x_signature: "invalid_hex_signature",
  });
  const resBadSig = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: badSigPayload,
  });
  assert(resBadSig.status === 401, "Forged or wrong signature returns 401");

  // Test 2: Unknown bill id -> 404
  const unknownBillPayload = new URLSearchParams(
    signFields({
      id: "bill_non_existent_9999",
      paid: "true",
      paid_amount: "150000",
      paid_at: "2026-04-01 00:30:12 +0800",
      transaction_id: "TX-TEST-02",
      transaction_status: "completed",
    })
  );
  const resUnknown = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: unknownBillPayload,
  });
  assert(resUnknown.status === 404, "Unknown bill id returns 404");

  // Test 3: paid=true and paid_amount mismatch -> 422
  const mismatchPayload = new URLSearchParams(
    signFields({
      id: testBillId,
      paid: "true",
      paid_amount: "999999", // Bill is 150000!
      paid_at: "2026-04-01 00:30:12 +0800",
      transaction_id: "TX-TEST-03",
      transaction_status: "completed",
    })
  );
  const resMismatch = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: mismatchPayload,
  });
  assert(resMismatch.status === 422, "Amount mismatch returns 422");

  // Test 4: Valid payment -> 200, bill becomes paid & creates payment
  const validPayload = new URLSearchParams(
    signFields({
      id: testBillId,
      paid: "true",
      paid_amount: "150000",
      paid_at: "2026-04-01 00:30:12 +0800",
      transaction_id: "TX-TEST-04",
      transaction_status: "completed",
    })
  );
  const resValid = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: validPayload,
  });
  assert(resValid.status === 200, "Valid paid webhook returns 200");

  const updatedBill = await prisma.gatewayBill.findUnique({ where: { id: testBillId } });
  assert(updatedBill?.status === "paid", "Bill status transitioned to 'paid'");

  const createdPayment = await prisma.payment.findFirst({ where: { gatewayBillId: testBillId } });
  assert(createdPayment !== null && createdPayment.status === "approved" && createdPayment.method === "online", "Online payment created with approved status");

  // Test 5: Replay / duplicate delivery -> 200 None
  const resReplay = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: validPayload,
  });
  assert(resReplay.status === 200, "Duplicate callback delivery returns 200 (idempotent)");

  const paymentsCount = await prisma.payment.count({ where: { gatewayBillId: testBillId } });
  assert(paymentsCount === 1, "Bill creates at most one payment ever (no duplicate payment)");

  // Test 6: Late or out-of-order paid=false on already paid bill -> 200, status remains paid
  const lateFailPayload = new URLSearchParams(
    signFields({
      id: testBillId,
      paid: "false",
      paid_amount: "0",
      paid_at: "2026-04-01 00:35:00 +0800",
      transaction_id: "TX-TEST-05",
      transaction_status: "failed",
    })
  );
  const resLateFail = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: lateFailPayload,
  });
  assert(resLateFail.status === 200, "Out-of-order failed webhook returns 200");

  const stillPaidBill = await prisma.gatewayBill.findUnique({ where: { id: testBillId } });
  assert(stillPaidBill?.status === "paid", "A paid bill never goes back to failed");

  console.log("\n=========================================");
  console.log(`🏁 WEBHOOK TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================\n");

  if (failed > 0) process.exit(1);
}

runWebhookTests()
  .catch((e) => {
    console.error("Webhook test failure:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
