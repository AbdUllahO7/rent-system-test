# EzyFusion Rent Collection System - Technical Assessment

**Candidate:** abdullahalhasan2@gmail.com  
**Role:** Full-Stack Developer  
**Company:** EzyFusion Group  
**Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL, Auth, RLS, Storage), Prisma ORM 7.10, Tailwind CSS, shadcn/ui  
**Business Timezone:** `Asia/Kuala_Lumpur` (UTC+8)  
**Currency:** `MYR` (Ringgit Malaysia), stored as integer sen (`bigint`)  

---

## 1. Credentials & Seed Data (Section 2)

All seeded test accounts share the unified password:
```
Password123!
```

### Seeded Organizations & Users:
- **Northwind Properties (`org_northwind`):**
  - Manager: `manager@northwind.test`
  - Staff: `staff@northwind.test`
  - Tenant: `aisyah@northwind.test` (Aisyah Rahman)
  - Tenant: `ben@northwind.test` (Ben Lim)
  - Tenant: `probe@northwind.test` (Probe Tenant)
- **Beta Realty (`org_beta`):**
  - Manager: `manager@beta.test`
  - Tenant: `chen@beta.test` (Chen Wei)

---

## 2. Assessment Grading Instructions

The grading script can run on a fresh clone using:
```bash
# 1. Start local Supabase stack
npx supabase start

# 2. Reset database from supabase/migrations/
npx supabase db reset

# 3. Install dependencies
npm install

# 4. Copy environment configuration
cp .env.example .env.local

# 5. Seed exact test data
npm run seed

# 6. Run automated verification test suite
npm test

# 7. Production build and start
npm run build && npm start
```

---

## 3. Architecture & Implementation Summary

### Priority 1: Billing Rules (`lib/billing.ts`) - Section 3
- Pure TypeScript implementation with zero external dependencies and zero I/O.
- Independent of host system timezone; verified across `TZ=UTC`, `TZ=Asia/Kuala_Lumpur`, and `TZ=America/New_York`.
- Implements:
  - `generateSchedule(lease)`: calendar month anchors from lease start date, inclusive periods, exact half-up proration on truncated final periods.
  - `invoiceStatus(invoice, now)`: dynamic status calculation (`paid`, `partially_paid`, `unpaid`, `overdue`) using Malaysia time (UTC+8).
  - `parseRinggitToSen(input)`: parses typed Ringgit amounts with comma group validation and 1-2 decimal places into integer sen.

### Priority 2: Access Control & Database - Sections 6 & 8
- Database objects located in `supabase/migrations/20261024000000_schema.sql`.
- Required 10 tables: `organizations`, `memberships`, `units`, `tenants`, `leases`, `invoices`, `payments`, `payment_allocations`, `gateway_bills`, `audit_log`.
- `audit_log` is immutable and append-only via a PostgreSQL trigger (`audit_log is append-only`).
- Private storage bucket `payment-slips` restricted to 5MB (JPEG, PNG, PDF) with folder isolation under `<org_id>/...`.
- Row Level Security (RLS) policies prevent cross-tenant and cross-organization data leakage.
- Direct Data API (PostgREST) writes are disabled; tenants can only update their own `phone` number.

### Priority 3: Payments & Allocations (`lib/payments.ts`) - Section 4
- Lease payment cap enforcement: `(totalInvoices - totalAllocated) - pending_verification`.
- Pessimistic row locking on lease rows (`SELECT ... FOR UPDATE`) prevents concurrent double payments.
- Automatic allocation order: `due_date ASC`, `deposit` before `rent`, `period_index ASC`.
- Manager operations:
  - `approve`: Re-checks remaining balance under row lock; allocates payment to invoices.
  - `reject`: Requires reason >= 5 characters.
  - `void`: Requires reason >= 5 characters; removes allocations without affecting other payments.
- Collections report (`lib/reports.ts`): Aggregates approved payments by calendar month of `received_at` in Malaysia time, returning 0 for months without collections.

### Priority 4: Gateway Webhook (`app/api/webhooks/gateway/route.ts`) - Section 5
- Processes `application/x-www-form-urlencoded` callbacks from payment gateway.
- Computes and verifies HMAC-SHA256 signature using `GATEWAY_X_SIGNATURE_KEY` on sorted pipe-delimited payload keys.
- Implements complete state table: `401` on invalid signature, `404` on unknown bill, `422` on mismatched amount, `200` on successful settlement and duplicate replays.
- At most one payment created per bill; out-of-order `paid=false` on already settled bills returns `200` without changing paid status.
- Includes simulator script `gateway-sim.mjs`.

### Priority 5: UI & Tenant Portal - Section 9
- Built using Next.js 16 App Router, Tailwind CSS, and shadcn/ui.
- Manager & Staff dashboard showing overdue invoice counts, 6-month collections report, lease lists, and payment approval/void controls.
- Tenant portal showing lease terms, invoices, amount due now, and Pay Now gateway bill creation.
- Return page at `/payments/return?bill_id=...` strictly displays confirmed database state.
- All dates and times rendered in Malaysia time (`Asia/Kuala_Lumpur`).

---

## 4. Test Suite Execution

Run all test suites:
```bash
npm test
```
- **Billing Suite (`tests/billing.test.ts`):** 33 assertions covering Aisyah's worked example, Ringgit parser validation, Malaysia timezone boundaries, and schedule generation.
- **API Suite (`tests/api.test.ts`):** 12 assertions covering collections report, lease overlap prevention (409), cap limits (422), approval lifecycle, voiding, and audit log append-only constraints.
