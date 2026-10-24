-- Enable Row Level Security
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is manager or staff
CREATE OR REPLACE FUNCTION is_manager_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "User"
    WHERE id = auth.uid()::text
    AND role IN ('MANAGER', 'STAFF')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User Policies
CREATE POLICY "Users can view own profile or managers can view all"
ON "User" FOR SELECT
USING (id = auth.uid()::text OR is_manager_or_staff());

CREATE POLICY "Users can update own profile"
ON "User" FOR UPDATE
USING (id = auth.uid()::text);

-- Property Policies
CREATE POLICY "Manager and Staff can manage properties"
ON "Property" FOR ALL
USING (is_manager_or_staff());

CREATE POLICY "Tenants can view property of active lease"
ON "Property" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "Lease"
    WHERE "Lease"."propertyId" = "Property".id
    AND "Lease"."tenantId" = auth.uid()::text
  )
);

-- Lease Policies
CREATE POLICY "Manager and Staff can manage leases"
ON "Lease" FOR ALL
USING (is_manager_or_staff());

CREATE POLICY "Tenants can view own leases"
ON "Lease" FOR SELECT
USING ("tenantId" = auth.uid()::text);

-- Invoice Policies
CREATE POLICY "Manager and Staff can manage invoices"
ON "Invoice" FOR ALL
USING (is_manager_or_staff());

CREATE POLICY "Tenants can view own invoices"
ON "Invoice" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "Lease"
    WHERE "Lease".id = "Invoice"."leaseId"
    AND "Lease"."tenantId" = auth.uid()::text
  )
);

-- Payment Policies
CREATE POLICY "Manager and Staff can manage payments"
ON "Payment" FOR ALL
USING (is_manager_or_staff());

CREATE POLICY "Tenants can view own payments"
ON "Payment" FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "Invoice"
    JOIN "Lease" ON "Lease".id = "Invoice"."leaseId"
    WHERE "Invoice".id = "Payment"."invoiceId"
    AND "Lease"."tenantId" = auth.uid()::text
  )
);

CREATE POLICY "Tenants can create payments for own invoices"
ON "Payment" FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "Invoice"
    JOIN "Lease" ON "Lease".id = "Invoice"."leaseId"
    WHERE "Invoice".id = "Payment"."invoiceId"
    AND "Lease"."tenantId" = auth.uid()::text
  )
);
