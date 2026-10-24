import { generateSchedule, invoiceStatus, parseRinggitToSen } from "../lib/billing";

console.log("=========================================");
console.log("🧪 TESTING LIB/BILLING.TS PURE LOGIC");
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

// ----------------------------------------------------
// 1. Worked Example Test: Aisyah's Lease
// ----------------------------------------------------
console.log("1. Testing Aisyah's Lease (Worked Example)");
const aisyahSchedule = generateSchedule({
  startDate: "2026-01-31",
  endDate: "2026-07-15",
  monthlyRentSen: 150000,
  depositSen: 300000,
});

assert(aisyahSchedule.length === 7, "Aisyah's lease generates exactly 7 invoices (1 deposit + 6 rent)");

// Check deposit
assert(
  aisyahSchedule[0].kind === "deposit" &&
  aisyahSchedule[0].periodIndex === null &&
  aisyahSchedule[0].periodStart === null &&
  aisyahSchedule[0].periodEnd === null &&
  aisyahSchedule[0].dueDate === "2026-01-31" &&
  aisyahSchedule[0].amountSen === 300000,
  "Deposit invoice: kind=deposit, due=2026-01-31, amount=300000"
);

// Check Period 0
assert(
  aisyahSchedule[1].kind === "rent" &&
  aisyahSchedule[1].periodIndex === 0 &&
  aisyahSchedule[1].periodStart === "2026-01-31" &&
  aisyahSchedule[1].periodEnd === "2026-02-27" &&
  aisyahSchedule[1].dueDate === "2026-01-31" &&
  aisyahSchedule[1].amountSen === 150000,
  "Period 0: 2026-01-31 to 2026-02-27, Due: 2026-01-31, Amount: 150000"
);

// Check Period 1
assert(
  aisyahSchedule[2].periodIndex === 1 &&
  aisyahSchedule[2].periodStart === "2026-02-28" &&
  aisyahSchedule[2].periodEnd === "2026-03-30" &&
  aisyahSchedule[2].dueDate === "2026-02-28" &&
  aisyahSchedule[2].amountSen === 150000,
  "Period 1: 2026-02-28 to 2026-03-30, Due: 2026-02-28, Amount: 150000"
);

// Check Period 2
assert(
  aisyahSchedule[3].periodIndex === 2 &&
  aisyahSchedule[3].periodStart === "2026-03-31" &&
  aisyahSchedule[3].periodEnd === "2026-04-29" &&
  aisyahSchedule[3].dueDate === "2026-03-31" &&
  aisyahSchedule[3].amountSen === 150000,
  "Period 2: 2026-03-31 to 2026-04-29, Due: 2026-03-31, Amount: 150000"
);

// Check Period 3
assert(
  aisyahSchedule[4].periodIndex === 3 &&
  aisyahSchedule[4].periodStart === "2026-04-30" &&
  aisyahSchedule[4].periodEnd === "2026-05-30" &&
  aisyahSchedule[4].dueDate === "2026-04-30" &&
  aisyahSchedule[4].amountSen === 150000,
  "Period 3: 2026-04-30 to 2026-05-30, Due: 2026-04-30, Amount: 150000"
);

// Check Period 4
assert(
  aisyahSchedule[5].periodIndex === 4 &&
  aisyahSchedule[5].periodStart === "2026-05-31" &&
  aisyahSchedule[5].periodEnd === "2026-06-29" &&
  aisyahSchedule[5].dueDate === "2026-05-31" &&
  aisyahSchedule[5].amountSen === 150000,
  "Period 4: 2026-05-31 to 2026-06-29, Due: 2026-05-31, Amount: 150000"
);

// Check Period 5 (Prorated)
assert(
  aisyahSchedule[6].periodIndex === 5 &&
  aisyahSchedule[6].periodStart === "2026-06-30" &&
  aisyahSchedule[6].periodEnd === "2026-07-15" &&
  aisyahSchedule[6].dueDate === "2026-06-30" &&
  aisyahSchedule[6].amountSen === 77419,
  "Period 5 (Prorated): 2026-06-30 to 2026-07-15, Due: 2026-06-30, Amount: 77419 sen"
);

// ----------------------------------------------------
// 2. parseRinggitToSen Tests
// ----------------------------------------------------
console.log("\n2. Testing parseRinggitToSen");
assert(parseRinggitToSen("1,500.50") === 150050, '"1,500.50" -> 150050');
assert(parseRinggitToSen("1.15") === 115, '"1.15" -> 115');
assert(parseRinggitToSen("7") === 700, '"7" -> 700');
assert(parseRinggitToSen("  1,500.50  ") === 150050, 'whitespace trimmed');
assert(parseRinggitToSen("0.5") === 50, '"0.5" -> 50');
assert(parseRinggitToSen("0.05") === 5, '"0.05" -> 5');
assert(parseRinggitToSen("0") === 0, '"0" -> 0');

function throws(fn: () => void, name: string) {
  try {
    fn();
    console.error(`  ❌ FAIL: ${name} (expected error)`);
    failed++;
  } catch {
    console.log(`  ✅ PASS: ${name} (correctly threw error)`);
    passed++;
  }
}

throws(() => parseRinggitToSen(""), 'empty string throws');
throws(() => parseRinggitToSen("-5"), 'negative amount throws');
throws(() => parseRinggitToSen("1.234"), 'more than 2 decimal places throws');
throws(() => parseRinggitToSen("1e3"), 'scientific notation throws');
throws(() => parseRinggitToSen("RM 10"), 'currency prefix throws');
throws(() => parseRinggitToSen("1,23"), 'invalid thousands separator throws');
throws(() => parseRinggitToSen("1,5000"), 'invalid group of four throws');

// ----------------------------------------------------
// 3. invoiceStatus Timezone & Edge Cases
// ----------------------------------------------------
console.log("\n3. Testing invoiceStatus");
const invoice = { dueDate: "2026-03-01", amountSen: 10000, paidSen: 0 };

// 1 second before midnight Malaysia time
const beforeMidnight = new Date("2026-03-01T15:59:59Z");
assert(invoiceStatus(invoice, beforeMidnight) === "unpaid", "2026-03-01T15:59:59Z is NOT overdue (Malaysia is still 2026-03-01)");

// Exactly midnight Malaysia time: 2026-03-02 00:00 Malaysia time = 2026-03-01T16:00:00Z
const exactlyMidnight = new Date("2026-03-01T16:00:00Z");
assert(invoiceStatus(invoice, exactlyMidnight) === "overdue", "2026-03-01T16:00:00Z IS overdue (Malaysia is 2026-03-02)");

// Paid statuses
assert(invoiceStatus({ dueDate: "2026-03-01", amountSen: 10000, paidSen: 10000 }, exactlyMidnight) === "paid", "Fully paid invoice is paid even if overdue");
assert(invoiceStatus({ dueDate: "2026-03-01", amountSen: 10000, paidSen: 15000 }, exactlyMidnight) === "paid", "Overpaid invoice is paid");
assert(invoiceStatus({ dueDate: "2026-03-01", amountSen: 10000, paidSen: 5000 }, beforeMidnight) === "partially_paid", "Partially paid invoice before due date is partially_paid");
assert(invoiceStatus({ dueDate: "2026-03-01", amountSen: 10000, paidSen: 5000 }, exactlyMidnight) === "overdue", "Partially paid invoice after due date is overdue");

// ----------------------------------------------------
// 4. Validation in generateSchedule
// ----------------------------------------------------
console.log("\n4. Testing generateSchedule Validations");
throws(() => generateSchedule({ startDate: "2026-02-30", endDate: "2026-05-01", monthlyRentSen: 1000, depositSen: 0 }), "Invalid date (Feb 30) throws");
throws(() => generateSchedule({ startDate: "2026-05-01", endDate: "2026-04-01", monthlyRentSen: 1000, depositSen: 0 }), "endDate before startDate throws");
throws(() => generateSchedule({ startDate: "2026-01-01", endDate: "2026-04-01", monthlyRentSen: 0, depositSen: 0 }), "0 monthly rent throws");
throws(() => generateSchedule({ startDate: "2026-01-01", endDate: "2026-04-01", monthlyRentSen: 1000.5, depositSen: 0 }), "Non-integer monthly rent throws");
throws(() => generateSchedule({ startDate: "2026-01-01", endDate: "2026-04-01", monthlyRentSen: 1000, depositSen: -100 }), "Negative deposit throws");

console.log("\n=========================================");
console.log(`🏁 BILLING TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=========================================\n");

if (failed > 0) process.exit(1);
