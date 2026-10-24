# AI Session Log 01 - Architecture, Environment & Billing Engine

**Timestamp:** 2026-10-24 21:05 MYT / UTC  
**Objective:** Project initialization, grading command verification, and implementation of Section 3 (`lib/billing.ts`).

---

## Directives & Decisions

1. **Section 3 (`lib/billing.ts`) Specification Compliance:**
   - Implemented pure, zero-dependency billing module with exact TypeScript contracts:
     - `generateSchedule(lease)`
     - `invoiceStatus(invoice, now)`
     - `parseRinggitToSen(input)`
   - Pure date arithmetic ensures no dependency on the execution environment's local timezone.
   - Verified across `TZ=UTC`, `TZ=Asia/Kuala_Lumpur`, and `TZ=America/New_York`.
   - Exact half-up rounding on prorated final periods ($150000 \times 16 / 31 = 77419$ sen).
   - Strict input validation rejecting invalid calendar days, malformed date strings, reversed lease terms, negative deposits, and non-integer amounts.
   - Strict parsing regex for Malaysian Ringgit to Sen, accepting comma thousand separators in groups of three and optional 1-2 decimal places.

2. **Automated Verification:**
   - Unit test suite created at `tests/billing.test.ts`.
   - 33 test assertions executed and passed across all 3 timezones (99/99 passing checks).
