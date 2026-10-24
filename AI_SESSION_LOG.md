# Technical Assessment - AI Session Log & Architecture Decisions

**Candidate:** abdullahalhasan2@gmail.com  
**Role:** Full-Stack Developer  
**Company:** EzyFusion Group  
**Project:** Rent Collection & Property Management System  
**Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL, Auth, RLS), Prisma ORM 7.10, Tailwind CSS, shadcn/ui  

---

## 1. System Architecture & Domain Model

The system manages end-to-end rent collection with multi-role access control:
- **Roles:**
  - `MANAGER`: Full CRUD over properties, leases, invoice issuance, financial reporting, and offline payment registration.
  - `STAFF`: Access to properties, leases, invoice tracking, and recording manual offline payments (CASH, BANK_TRANSFER).
  - `TENANT`: Self-service view of active lease, invoice status, payment history, and online invoice payment.
- **Entities & Relations:**
  - `User` 1-N `Property` (as Manager)
  - `User` 1-N `Lease` (as Tenant)
  - `Property` 1-N `Lease`
  - `Lease` 1-N `Invoice`
  - `Invoice` 1-N `Payment`
  - `User` 1-N `Payment` (as Staff/Manager `recordedBy`)

---

## 2. Key Engineering & Evaluated Decisions

### A. Concurrency Safety & Race Condition Prevention
- **Pessimistic Row Locking (`FOR UPDATE`):**
  In PostgreSQL, concurrent requests under default `READ COMMITTED` isolation level can read the same invoice balance and double-pay.
  - To prevent overpayment race conditions, `processPayment()` acquires an exclusive lock:
    ```sql
    SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE;
    ```
  - This serializes concurrent payments for the same invoice, guaranteeing that balance checks and state transitions are atomic.

### B. Idempotency & Replay Protection
- Every payment request accepts an optional `idempotencyKey` (with an `@unique` database index).
- **Fast Path:** If an existing payment with the same key is found, it immediately returns the duplicate payload without re-charging.
- **Race Path:** If two simultaneous requests with the exact same idempotency key race past the initial check, PostgreSQL catches the unique constraint (`P2002`). The transaction handler gracefully catches `P2002` and returns the already-created record instead of a 500 error.

### C. Precision Money Handling
- Floating-point calculations (`0.1 + 0.2 === 0.30000000000000004`) lead to financial accounting bugs.
- All monetary operations are converted to integer cents (`toCents`), calculated as integers, and converted back (`fromCents`, `toDecimal`).
- Database columns use `@db.Decimal(10, 2)`.

### D. Timezone & UTC Consistency
- Rent billing and invoice due dates are processed strictly in UTC (`parseUTCDate`, `formatUTCDate`, `generateBillingSchedule`).
- Eliminates client-server timezone shifts (e.g., invoices shifting to the previous month depending on browser offset).

### E. Database Security & Row Level Security (RLS)
- RLS is enabled on all tables (`User`, `Property`, `Lease`, `Invoice`, `Payment`).
- Helper function `is_manager_or_staff()` uses `SECURITY DEFINER` to securely evaluate roles against `auth.uid()::text`.
- Direct tenant access is restricted to their own leases, invoices, and payments.
- Seed script syncs test accounts with Supabase Auth (`auth.users`) to ensure testing through authenticated Supabase clients matches database UUIDs.

### F. Idempotent Payment Webhook Endpoint
- Location: `/api/webhooks/payments`
- Supports gateway webhook payloads (`payment.succeeded`, `payment.failed`).
- Verifies signature when `PAYMENT_WEBHOOK_SECRET` is configured.
- Guarantees idempotent event processing using `eventId` / `transactionId`.

---

## 3. Automated Test Suite

A standalone test suite is provided at `tests/rent-system.test.ts` executable via:
```bash
npm test
```
Tests pass **20/20** assertions covering:
1. Floating-point money calculation accuracy.
2. UTC date parsing and billing schedule generation.
3. Partial payment status transition (`PENDING` ➔ `PARTIALLY_PAID`).
4. Idempotency replay with duplicate detection.
5. Overpayment prevention error handling.
6. Full payment status transition (`PARTIALLY_PAID` ➔ `PAID`).
7. Blocking payments on already settled invoices.
