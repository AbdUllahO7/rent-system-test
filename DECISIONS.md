# Architectural Decisions (DECISIONS.md)

This document answers the Part C evaluation questions. Each answer is strictly under 150 words and references exact repository files and line numbers.

---

### 1. Gateway Duplicate Webhook Delivery (5 ms apart)

Both callbacks pass HMAC-SHA256 signature verification in [app/api/webhooks/gateway/route.ts:25-39](file:///Users/abdullahalhasan/rent-system-test/app/api/webhooks/gateway/route.ts#L25-L39).

Callback 1 enters `prisma.$transaction` and acquires an exclusive row lock on the bill at line 74:
`SELECT id FROM "gateway_bills" WHERE id = ${bill.id} FOR UPDATE`.

Callback 2 reaches line 74 and blocks at the database level waiting for Callback 1's lock.

Callback 1 checks `freshBill.status !== "paid"` (line 77), updates `gateway_bills.status = "paid"` (lines 82–85), creates the single approved payment (lines 100–112), allocates it to unpaid invoices (lines 115–172), and commits, releasing the lock.

Callback 2 unblocks, acquires the row lock, and re-reads the bill at line 76. At line 77:
`if (freshBill?.status === "paid") { return; }`
It detects the bill is already settled and returns immediately without creating duplicate payments or allocations. Line 67 also exits early if a callback arrives post-commit. Both requests return HTTP 200.

---

### 2. Concurrent Payment Recording & Cap Enforcement

In [lib/payments.ts:136-171](file:///Users/abdullahalhasan/rent-system-test/lib/payments.ts#L136-L171), both requests run inside `prisma.$transaction`:

1. The first request to reach line 146 acquires an exclusive row lock on the lease:
`SELECT id FROM "leases" WHERE id = ${leaseId} FOR UPDATE`.
2. The second request blocks waiting for the row lock.
3. Request 1 computes the remaining payment cap at lines 159–166:
`paymentCapSen = remainingBalanceSen - pendingTotalSen = 100,000 - 0 = 100,000 sen` (RM 1,000). The RM 800 payment (80,000 sen $\le$ 100,000 sen) is accepted, inserted as `pending_verification`, and commits.
4. Request 2 unblocks, acquires the lock, and re-queries pending payments. At lines 161–166, `pendingTotalSen` is now 80,000 sen. The new cap is:
`100,000 - 80,000 = 20,000 sen` (RM 200).
5. At line 168, `70,000 > 20,000`. The second request throws `AuthError` and is rejected with HTTP 422: `Payment amount 70000 sen exceeds cap (20000 sen)`.

---

### 3. Date and Timezone Conversions

1. [lib/billing.ts:70-73](file:///Users/abdullahalhasan/rent-system-test/lib/billing.ts#L70-L73) (`invoiceStatus`): Converts `now` instant to calendar date by adding 8 hours (`UTC+8`). Timezone: `Asia/Kuala_Lumpur`. Right because due dates expire at 23:59:59 Malaysia time (15:59:59 UTC).
2. [lib/reports.ts:36-41](file:///Users/abdullahalhasan/rent-system-test/lib/reports.ts#L36-L41) (`getCollectionsReport`): Uses `AT TIME ZONE 'Asia/Kuala_Lumpur'` and offsets month bounds by `+08:00`. Timezone: `Asia/Kuala_Lumpur`. Right because payments received before midnight MYT belong to that Malaysian calendar month.
3. [app/api/leases/[leaseId]/gateway-bills/route.ts:40-42](file:///Users/abdullahalhasan/rent-system-test/app/api/leases/[leaseId]/gateway-bills/route.ts#L40-L42) & [app/actions/gateway.ts:25-27](file:///Users/abdullahalhasan/rent-system-test/app/actions/gateway.ts#L25-L27): Computes `todayMytStr` (`now + 8h`) for dues $\le$ today. Timezone: `Asia/Kuala_Lumpur`. Right because "due now" depends on the current calendar date in Malaysia.
4. [app/api/webhooks/gateway/route.ts:90](file:///Users/abdullahalhasan/rent-system-test/app/api/webhooks/gateway/route.ts#L90): Parses `fields.paid_at` with its explicit `+08:00` offset to UTC instant. Timezone: Preserves gateway's Malaysian timestamp for accurate accounting.
5. [lib/dates.ts:51-86](file:///Users/abdullahalhasan/rent-system-test/lib/dates.ts#L51-L86) & [components/malaysia-time.tsx:21-25](file:///Users/abdullahalhasan/rent-system-test/components/malaysia-time.tsx#L21-L25): Formats all instants with `timeZone: "Asia/Kuala_Lumpur"`. Right because viewers in any timezone see identical Malaysian business time without hydration errors.

---

### 4. Queries Not Subject to RLS & Authorization Enforcement

1. **Prisma ORM queries** ([lib/prisma.ts:1-20](file:///Users/abdullahalhasan/rent-system-test/lib/prisma.ts#L1-L20)): Prisma connects as database owner (`postgres` superuser) via pooled connections, bypassing Postgres RLS.
2. **Supabase Service Role Client** ([lib/supabase/service-role.ts:8-21](file:///Users/abdullahalhasan/rent-system-test/lib/supabase/service-role.ts#L8-L21)): Uses `SUPABASE_SERVICE_ROLE_KEY` to administer storage files and seed auth users.
3. **Database Trigger Function** `audit_log_append_only()` ([supabase/migrations/20261024000000_schema.sql:128-137](file:///Users/abdullahalhasan/rent-system-test/supabase/migrations/20261024000000_schema.sql#L128-L137)): Runs with owner privileges to enforce append-only immutability.

**What enforces authorization instead**:
Application-level authorization in [lib/auth.ts:31-72](file:///Users/abdullahalhasan/rent-system-test/lib/auth.ts#L31-L72) (`authenticateRequest`):
- Authenticates caller using `supabase.auth.getUser()`.
- Resolves role and organization strictly from database records (`memberships` or `tenants`).
- Every query explicitly scopes data with `where: { orgId: auth.orgId }` or `where: { tenantId: auth.tenantId }`.
- Returns HTTP 401 for unauthenticated calls, 403 for insufficient roles, and 404 for cross-organization or cross-tenant requests to never reveal record existence. (Direct client calls to Supabase Data/Storage APIs are separately enforced by PostgreSQL RLS).

---

### 5. Reopened Invoices and Pre-existing Unapplied Sen

When an approved payment is voided in [lib/payments.ts:348-364](file:///Users/abdullahalhasan/rent-system-test/lib/payments.ts#L348-L364), our system acquires an exclusive lease lock, deletes only that payment's allocations (`tx.paymentAllocation.deleteMany({ where: { paymentId } })`), sets the payment status to `voided`, and leaves all other payments' allocations and `unapplied_sen` completely untouched.

**Why we chose this**:
1. **Direct Specification Mandate**: Section 4 explicitly dictates: *"Removes that payment's allocations; other payments' allocations do not change."*
2. **Accounting Audit Integrity**: Payments and receipts are immutable historical financial instruments. Retroactively applying previously unapplied funds to newly reopened invoices modifies historical transaction receipts, distorts payment dates, and introduces unpredictable accounting shifts without a manager's conscious intent.
3. **Managerial Control**: It provides clarity; managers can review the reopened invoice and explicitly choose whether to allocate unapplied funds or record a fresh payment.

---

### 6. Two Things the AI Assistant Got Wrong

1. **Calling `deleteMany()` on append-only `audit_log`**:
The AI wrote `prisma.auditLog.deleteMany()` in `prisma/seed.ts` to reset test tables. Running `npm run seed` caused PostgreSQL to fail with: `P0001: audit_log is append-only`. We noticed because our database trigger in `supabase/migrations/20261024000000_schema.sql` prohibits `DELETE`. The AI replaced table resets with `TRUNCATE TABLE ... CASCADE;`, which bypasses row delete triggers. Documented in [ai-logs/full-conversation.md:Turn 3](file:///Users/abdullahalhasan/rent-system-test/ai-logs/full-conversation.md).

2. **Querying non-existent `createdAt` column on `Lease`**:
In `app/page.tsx`, the AI added `orderBy: { createdAt: "desc" }` to `prisma.lease.findMany`. Running `npx tsc --noEmit` caught TypeScript error `TS2339: Property 'createdAt' does not exist on type 'Lease'`. We noticed because the strict database schema in Section 8 does not define a `createdAt` column on `leases`. We corrected the sorting to `orderBy: { startDate: "desc" }`. Documented in [ai-logs/full-conversation.md:Turn 7](file:///Users/abdullahalhasan/rent-system-test/ai-logs/full-conversation.md).
