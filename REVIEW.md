# Code Review: Pull Request Assessment

This document reviews the pull request containing `app/api/leases/[leaseId]/late-fees/route.ts`, `app/api/webhooks/gateway/route.ts`, and `app/(staff)/dashboard/actions.ts`.

Issues are ordered strictly from **most severe** to **least severe**. Only genuine defects are reported; items that appear suspicious but are correct are analyzed in the final section to eliminate false positives.

---

## Findings (Ordered by Severity)

### 1. Webhook Reads Signature from Body Field Instead of `X-Signature` Header
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Lines 8–16
- **Severity**: **Critical**
- **What goes wrong**:
  The code inspects `fields.x_signature` extracted from `req.formData()`. However, Section 5 of the specification explicitly states:
  > *"Every request carries an X-Signature header: the HMAC-SHA256 hex digest of the payload using your secret GATEWAY_X_SIGNATURE_KEY."*
  
  **Concrete Scenario**: In production, the payment gateway sends the signature in the HTTP header `X-Signature`. The form body does not contain an `x_signature` field, so `fields.x_signature` is `undefined`. Every legitimate incoming webhook delivery fails the check `expected !== fields.x_signature` and is rejected with `401 Unauthorized`. **No online bill can ever be settled.**
- **The Fix**:
  Read the signature directly from the request headers:
  ```ts
  const signature = req.headers.get('x-signature') ?? req.headers.get('X-Signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }
  ```

---

### 2. Invalid Webhook Signature Payload Construction (Missing `=` Delimiter)
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Lines 9–13
- **Severity**: **Critical**
- **What goes wrong**:
  The code maps each key to `${k}${fields[k]}` without an equals sign (`=`). The specification states:
  > *"The signature input is each key=value pair in alphabetical order of key, separated by |."*
  > *Example: `id=bill_8f3a2c|paid=true|paid_amount=210050|paid_at=2026-03-28T14:22:10+08:00`*

  **Concrete Scenario**: For payload `id=bill_1&paid=true`, the teammate's code builds `idbill_1|paidtrue` instead of `id=bill_1|paid=true`. The resulting HMAC digest will never match the signature sent by the gateway, causing every webhook to be rejected with 401.
- **The Fix**:
  Include the `=` delimiter when constructing the signature input:
  ```ts
  const source = Object.keys(fields)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('|')
  ```

---

### 3. Missing Amount Match Validation (Underpayment Security Vulnerability)
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Lines 17, 24–34
- **Severity**: **Critical**
- **What goes wrong**:
  When `fields.paid === 'true'`, the webhook updates the bill to `paid` and creates a payment without checking whether `fields.paid_amount` matches `bill.amountSen`. Section 5 specifies:
  > *`pending | paid=true, paid_amount matches bill` $\rightarrow$ `paid, payment created and allocated (200)`*
  > *`pending | paid=true, paid_amount does not match bill` $\rightarrow$ `failed (422)`*

  **Concrete Scenario**: A tenant has a bill for RM 2,000 (200,000 sen). A malicious actor or corrupted gateway callback posts `paid=true` with `paid_amount=100` (RM 1.00). The handler marks the RM 2,000 bill as fully paid in the database and creates an approved payment for RM 1.00.
- **The Fix**:
  Validate that `BigInt(fields.paid_amount) === bill.amountSen`. If mismatched, mark the bill `failed` and return HTTP 422:
  ```ts
  if (BigInt(fields.paid_amount) !== bill.amountSen) {
    await prisma.gatewayBill.update({
      where: { id: bill.id },
      data: { status: 'failed' },
    })
    return NextResponse.json({ error: 'Paid amount does not match bill' }, { status: 422 })
  }
  ```

---

### 4. Privilege Escalation via User-Editable `user_metadata`
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Lines 12–15
- **Severity**: **Critical**
- **What goes wrong**:
  The handler trusts `user?.user_metadata.role !== 'manager'`. Supabase `user_metadata` is completely writable by the user through the client SDK (`supabase.auth.updateUser({ data: { role: 'manager' } })`). Section 6 explicitly forbids this:
  > *"Roles come from your memberships table, and from tenants.user_id for tenants. Never take a role or an organization from anything the user can edit, such as user_metadata."*

  **Concrete Scenario**: Any authenticated tenant can update their own metadata to `{ role: "manager" }` and successfully trigger late fee creation across leases.
- **The Fix**:
  Query the user's role from the `memberships` table:
  ```ts
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, orgId: lease.orgId },
  })
  if (membership?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  ```

---

### 5. Cross-Organization / Cross-Tenant Security Breach
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Lines 17–22
- **Severity**: **Critical**
- **What goes wrong**:
  The route fetches the lease with `prisma.lease.findUnique({ where: { id: leaseId } })` without scoping it to the caller's organization. Section 6 mandates:
  > *"A request about a record in another organization, or another tenant's record, gets 404: do not reveal that it exists."*

  **Concrete Scenario**: A legitimate manager from Beta Realty (`org_beta`) calls `/api/leases/:leaseId/late-fees` using a `leaseId` belonging to Northwind Properties (`org_northwind`). The endpoint finds the lease, validates that the user is a manager (in Beta), and assesses late fees on Northwind's tenant.
- **The Fix**:
  Verify membership in `lease.orgId`, and return 404 if the lease does not exist or belongs to a different organization:
  ```ts
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, role: 'manager' },
  })
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, orgId: membership.orgId },
    include: { invoices: { include: { allocations: true } } },
  })
  if (!lease) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  ```

---

### 6. Zero Authentication & Authorization on Public Server Action
- **File & Lines**: `app/(staff)/dashboard/actions.ts`, Lines 6–13
- **Severity**: **Critical**
- **What goes wrong**:
  `getCollections` is marked `'use server'`, making it a public POST endpoint callable by any client. It accepts an arbitrary `orgId` without authenticating the caller (`supabase.auth.getUser()`) or verifying organization membership. Section 6 states:
  > *"Access is enforced in two places... Your server code: route handlers, Server Actions and server components. Every endpoint must authenticate the caller and check their organization and role itself... A request about a record in another organization... gets 404... A request without a valid login gets 401."*

  **Concrete Scenario**: Any unauthenticated visitor or tenant can call `getCollections("org_northwind", "2026-01-01", "2026-06-01")` directly and download the full monthly financial collections data of Northwind Properties.
- **The Fix**:
  Authenticate the caller and verify that they are a staff member or manager of `orgId`:
  ```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, orgId },
  })
  if (!membership || (membership.role !== 'staff' && membership.role !== 'manager')) {
    throw new Error('Not found')
  }
  ```

---

### 7. Fatal SQL Type Cast Error (`org_id = ${orgId}::uuid`)
- **File & Lines**: `app/(staff)/dashboard/actions.ts`, Line 9
- **Severity**: **Critical**
- **What goes wrong**:
  The raw SQL query explicitly casts `org_id` to UUID: `WHERE org_id = ${orgId}::uuid`. In this system (Section 2 & Section 8), organization IDs are text strings (e.g. `org_northwind`, `org_beta`), not UUIDs.

  **Concrete Scenario**: Whenever `getCollections('org_northwind', ...)` executes, PostgreSQL throws a fatal query failure:
  `ERROR: invalid input syntax for type uuid: "org_northwind"`.
  The function crashes 100% of the time.
- **The Fix**:
  Remove the `::uuid` cast:
  ```sql
  WHERE org_id = ${orgId} AND status = 'approved'
  ```

---

### 8. Webhook Race Condition on Duplicate / Retry Deliveries
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Lines 19–24
- **Severity**: **High**
- **What goes wrong**:
  The idempotency check `if (bill.status === 'paid') return NextResponse.json({ ok: true })` runs outside the transaction and without row-level locking. Section 5 specifies:
  > *"We test repeat delivery: duplicate webhooks must not create duplicate payments or allocations."*

  **Concrete Scenario**: The gateway sends two retry requests in quick succession. Both requests execute `findUnique` concurrently before either has committed its transaction. Both observe `bill.status === 'pending'`, and both enter `prisma.$transaction`, creating two separate payments and allocating twice the funds to the tenant's invoices.
- **The Fix**:
  Use atomic state transition inside the transaction:
  ```ts
  await prisma.$transaction(async (tx) => {
    const updated = await tx.gatewayBill.updateMany({
      where: { id: bill.id, status: 'pending' },
      data: { status: 'paid' },
    })
    if (updated.count === 0) return // Already processed by a concurrent worker

    const payment = await tx.payment.create({ ... })
    await allocate(tx, payment.id)
  })
  ```

---

### 9. Gateway `paid = false` Fails to Transition Bill Status to `failed`
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Line 17
- **Severity**: **High**
- **What goes wrong**:
  `if (fields.paid !== 'true') return NextResponse.json({ ok: true })`
  If a payment attempt fails or is canceled at the gateway, the gateway sends `paid=false`. Section 5 specifies:
  > *`pending | paid=false` $\rightarrow$ `failed (200)`*

  **Concrete Scenario**: A tenant fails payment. The route returns 200 without updating the database. The bill stays in `pending` forever. The `/payments/return` page continues to show "Pending", and any subsequent attempt by the tenant to pay online is blocked or ambiguous.
- **The Fix**:
  Update the bill status to `'failed'` when `fields.paid === 'false'`:
  ```ts
  if (fields.paid !== 'true') {
    if (bill.status === 'pending') {
      await prisma.gatewayBill.update({
        where: { id: bill.id },
        data: { status: 'failed' },
      })
    }
    return NextResponse.json({ ok: true })
  }
  ```

---

### 10. UTC Date Truncation Groups Payments into Wrong Month
- **File & Lines**: `app/(staff)/dashboard/actions.ts`, Lines 8–10
- **Severity**: **High**
- **What goes wrong**:
  The database server runs in UTC. `date_trunc('month', received_at)` truncates the timestamp in UTC rather than in Malaysia time (`Asia/Kuala_Lumpur`, UTC+8). Section 1 & Section 4 mandate:
  > *"Every date and time the app shows or accepts is Malaysia time, whatever the timezone of the server... For each calendar month in the range, the total sen of approved payments with received_at in that month, in Malaysia time."*

  **Concrete Scenario**: A tenant pays on `2026-02-01 03:00:00` Malaysia time. In UTC, this is stored as `2026-01-31 19:00:00Z`. `date_trunc('month', received_at)` in UTC places this payment in **January 2026** instead of **February 2026**. Additionally, the filter `received_at >= ${from}::date` parses `'2026-02-01'::date` as `2026-02-01 00:00:00 UTC` (which is `2026-02-01 08:00:00 MYT`), dropping all payments made in the first 8 hours of February.
- **The Fix**:
  Convert `received_at` to `Asia/Kuala_Lumpur` before truncating:
  ```sql
  SELECT to_char(date_trunc('month', received_at AT TIME ZONE 'Asia/Kuala_Lumpur'), 'YYYY-MM') AS month,
         SUM(amount_sen) AS total
  FROM payments
  WHERE org_id = ${orgId} AND status = 'approved'
    AND received_at >= (${from}::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    AND received_at < ((${to}::timestamp + interval '1 month') AT TIME ZONE 'Asia/Kuala_Lumpur')
  GROUP BY 1
  ORDER BY 1
  ```

---

### 11. Lack of Idempotency: Duplicate Late Fee Accumulation
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Lines 28–46
- **Severity**: **High**
- **What goes wrong**:
  The handler does not check whether a `late_fee` invoice has already been issued for the overdue rent invoice.
  
  **Concrete Scenario**: A rent invoice due on 2026-01-31 is unpaid. A manager runs this endpoint on 2026-02-09, creating a 2% late fee invoice. If the manager clicks the button again, or if an automated job runs the next day, another 2% late fee invoice is created for the same rent period, repeatedly billing the tenant 2% multiple times.
- **The Fix**:
  Check if a late fee invoice already exists for that period or lease, or record a link/flag:
  ```ts
  const existingLateFee = await prisma.invoice.findFirst({
    where: { leaseId, kind: 'late_fee', periodIndex: invoice.periodIndex },
  })
  if (existingLateFee) continue
  ```

---

### 12. Reference Number Race Condition in Async Loop
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Lines 33–46, 50–52
- **Severity**: **High**
- **What goes wrong**:
  `nextReference(lease.orgId)` performs an uncommitted `findFirst` to get the last reference (`INV-X`). The loop calls `nextReference` and pushes `prisma.invoice.create(...)` promises to an array before any of them resolve.
  
  **Concrete Scenario**: A lease has two overdue rent invoices. In iteration 1, `nextReference` reads `INV-10` and computes `INV-11`. Iteration 2 calls `nextReference` before iteration 1 has finished inserting into the database; it also reads `INV-10` and computes `INV-11`. Both invoices attempt to insert with `reference = "INV-11"`, causing duplicate reference numbers or a database unique constraint violation.
- **The Fix**:
  Create invoices sequentially inside a single transaction or utilize a database sequence (`nextval(...)`).

---

### 13. Arbitrary 99.5% Payment Threshold Waives Overdue Rent
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Line 31
- **Severity**: **Medium**
- **What goes wrong**:
  `if (Number(paid) / Number(invoice.amountSen) >= 0.995) continue`
  The business specification says:
  > *"Adds a 2% late fee for each rent invoice still unpaid more than 7 days after its due date."*

  **Concrete Scenario**: If monthly rent is RM 2,000 (200,000 sen) and the tenant has paid RM 1,990 (leaving RM 10 unpaid), `paid / amountSen` is `0.995`. The invoice is not fully paid, yet this condition skips the invoice and charges no late fee. The system permits no such tolerance for rent obligations.
- **The Fix**:
  Check whether the invoice is fully settled:
  ```ts
  if (paid >= invoice.amountSen) continue
  ```

---

### 14. Unauthenticated Callers Return 403 Forbidden Instead of 401 Unauthorized
- **File & Lines**: `app/api/leases/[leaseId]/late-fees/route.ts`, Lines 12–15
- **Severity**: **Medium**
- **What goes wrong**:
  When an unauthenticated request is made, `user` is `null`. The condition `user?.user_metadata.role !== 'manager'` evaluates to `true` and returns `403 Forbidden`. Section 6 requires:
  > *"A request without a valid login gets 401."*
- **The Fix**:
  Return 401 if `user` is missing:
  ```ts
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  ```

---

### 15. Months with Zero Collections Omitted from Report
- **File & Lines**: `app/(staff)/dashboard/actions.ts`, Lines 8–13
- **Severity**: **Medium**
- **What goes wrong**:
  The raw SQL query groups only existing rows in `payments`. If no approved payments occurred in a month, `GROUP BY` returns no row for that month. Section 4 & Section 7 contract:
  > *"Months with no collections must be present with collectedSen: 0."*
  > *Example: `[{ month: '2026-01', collectedSen: 300000 }, { month: '2026-02', collectedSen: 0 }, { month: '2026-03', collectedSen: 200000 }]`*

  **Concrete Scenario**: For the range `2026-01` to `2026-03`, if February has zero payments, the function returns an array of only 2 elements (`['2026-01', '2026-03']`), violating the API contract and causing frontend charts to misalign.
- **The Fix**:
  Generate all consecutive months in the range and populate missing months with `collectedSen: 0`.

---

### 16. Webhook Ignores Gateway `paid_at` Timestamp
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Line 29
- **Severity**: **Medium**
- **What goes wrong**:
  The payment record is created with `receivedAt: new Date()` (current server execution time) instead of parsing the gateway's `fields.paid_at`.

  **Concrete Scenario**: A tenant pays on March 31 at 23:58. If network issues or gateway queuing delay delivery to April 1 at 00:05, recording `new Date()` attributes the revenue to April instead of March, corrupting collections reports and audit logs.
- **The Fix**:
  Use `receivedAt: new Date(fields.paid_at)`.

---

### 17. Non-Constant-Time Signature Comparison (Timing Attack Vulnerability)
- **File & Lines**: `app/api/webhooks/gateway/route.ts`, Line 14
- **Severity**: **Low**
- **What goes wrong**:
  `if (expected !== fields.x_signature)` performs standard string equality comparison, which terminates at the first mismatched character.
- **The Fix**:
  Use `crypto.timingSafeEqual`:
  ```ts
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  ```

---

## Suspicious but Correct (Not a Bug)

To eliminate false positives, the following items were analyzed and confirmed to be **correct**:

1. **`allocate(tx, paymentId)` function call**:
   - The brief states: *"Assume allocate(tx, paymentId) is correct."* Its internal allocation ordering and row updates are assumed correct.
2. **`Math.round((Number(invoice.amountSen - paid) * 2) / 100)` calculation**:
   - For non-negative values, `Math.round()` performs standard round-half-up, which satisfies integer sen precision without floating-point storage.
3. **`todayMyt` computation via `Date.now() + 8 * 3600 * 1000`**:
   - While date arithmetic via millisecond offsets is often error-prone in regions with daylight saving time, Malaysia (`Asia/Kuala_Lumpur`) is strictly UTC+8 year-round with no daylight saving adjustments. Taking `.toISOString().slice(0, 10)` on `Date.now() + 8 hours` accurately extracts the Malaysia calendar date.
4. **Prisma raw query template interpolation in `dashboard/actions.ts`**:
   - In Prisma, tagged template literals with `prisma.$queryRaw` do not concatenate raw SQL strings; Prisma automatically parameterizes interpolations (`${orgId}`, `${from}`) into prepared statement variables (`$1`, `$2`), preventing SQL injection.
