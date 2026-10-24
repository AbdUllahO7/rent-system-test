# AI Session Log 02 - Schema, Payments, Gateway Webhook & HTTP API

**Timestamp:** 2026-10-24 21:30 MYT / UTC  
**Objective:** End-to-end implementation of Sections 1 through 9 of the EzyFusion Technical Assessment.

---

## Directives & Decisions

1. **Database Schema & Migrations (`supabase/migrations/20261024000000_schema.sql`):**
   - Implemented exact 10 required tables:
     `organizations`, `memberships`, `units`, `tenants`, `leases`, `invoices`, `payments`, `payment_allocations`, `gateway_bills`, `audit_log`.
   - Money stored as integer sen (`bigint`), calendar dates as `date`, and timestamps as `timestamptz`.
   - Configured `audit_log` with an immutable database trigger (`audit_log is append-only`) blocking `UPDATE` and `DELETE` for all roles.
   - Configured private storage bucket `payment-slips` limited to 5MB with JPEG/PNG/PDF mime-types and RLS isolating uploads to `<org_id>/...`.
   - PostgREST Data API RLS policies strictly enforced as defined in Section 6.

2. **Billing Engine & Validation (`lib/billing.ts`):**
   - Pure, zero-dependency engine.
   - Verified across `TZ=UTC`, `TZ=Asia/Kuala_Lumpur`, and `TZ=America/New_York` (33 assertions passing in all timezones).
   - Proration on final periods uses exact half-up rounding.
   - Dynamic `invoiceStatus` computation based on UTC+8 Malaysia time.

3. **Payments & Allocation Engine (`lib/payments.ts`):**
   - Implemented lease cap enforcement: `(totalInvoices - totalAllocated) - pending_verification`.
   - Pessimistic row locking on leases (`SELECT ... FOR UPDATE`) prevents race conditions between concurrent payment recordings.
   - Allocation order: `due_date ASC`, then `deposit` before `rent`, then `period_index ASC`.
   - Approval rechecks remaining balance under row lock.
   - Rejection and Voiding require at least 5-character reasons.
   - Voiding removes allocations without affecting other payments.
   - All lifecycle events write audit log entries.

4. **Gateway Webhook Handler (`app/api/webhooks/gateway/route.ts`):**
   - `application/x-www-form-urlencoded` body parser.
   - Exact HMAC-SHA256 signature verification matching Section 5 test vector.
   - Return codes: `401` on invalid/missing signature, `404` on unknown bill, `422` on amount mismatch, `200` on successful settlement and duplicate deliveries.
   - Guaranteed at most one payment per bill.
   - Out-of-order `paid=false` on already paid bill returns `200` without modifying settled status.

5. **HTTP API Handlers (`app/api/...`):**
   - Implemented all routes specified in Section 7:
     - `POST /api/leases`
     - `GET /api/leases/:leaseId`
     - `POST /api/leases/:leaseId/payments`
     - `POST /api/payments/:paymentId/approve`
     - `POST /api/payments/:paymentId/reject`
     - `POST /api/payments/:paymentId/void`
     - `POST /api/leases/:leaseId/gateway-bills`
     - `GET /api/reports/collections`
     - `POST /api/webhooks/gateway`
   - Authentication derives roles and organizations strictly from database records (`memberships` or `tenants`).
   - Cross-organization or cross-tenant access returns `404` to prevent information disclosure.
   - Unauthorized actions return `403`.

6. **Seed Script (`prisma/seed.ts`):**
   - Implemented exact seed dataset for `Northwind Properties` and `Beta Realty`.
   - Syncs accounts to Supabase Auth (`auth.users`) with uniform password `Password123!`.
   - Verified that Northwind's collections report for `2026-01` to `2026-03` produces:
     `[{ month: '2026-01', collectedSen: 300000 }, { month: '2026-02', collectedSen: 0 }, { month: '2026-03', collectedSen: 200000 }]`.
