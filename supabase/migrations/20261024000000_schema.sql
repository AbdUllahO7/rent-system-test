-- Create schema for EzyFusion Rent Collection System
-- Compliant with Sections 6 & 8 of Technical Assessment

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

-- 2. Memberships (staff and manager)
CREATE TABLE memberships (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
    PRIMARY KEY (user_id, org_id)
);

-- 3. Units
CREATE TABLE units (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

-- 4. Tenants
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL
);

-- 5. Leases
CREATE TABLE leases (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monthly_rent_sen BIGINT NOT NULL CHECK (monthly_rent_sen > 0),
    deposit_sen BIGINT NOT NULL DEFAULT 0 CHECK (deposit_sen >= 0)
);

-- 6. Invoices
CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('deposit', 'rent')),
    period_index INT,
    period_start DATE,
    period_end DATE,
    due_date DATE NOT NULL,
    amount_sen BIGINT NOT NULL CHECK (amount_sen > 0)
);

-- 7. Payments
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    amount_sen BIGINT NOT NULL CHECK (amount_sen > 0),
    unapplied_sen BIGINT NOT NULL DEFAULT 0,
    method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'online')),
    status TEXT NOT NULL CHECK (status IN ('pending_verification', 'approved', 'rejected', 'voided')),
    received_at TIMESTAMPTZ NOT NULL,
    slip_path TEXT,
    gateway_bill_id TEXT,
    rejection_reason TEXT,
    void_reason TEXT,
    recorded_by_id UUID REFERENCES auth.users(id)
);

-- 8. Payment Allocations
CREATE TABLE payment_allocations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount_sen BIGINT NOT NULL CHECK (amount_sen > 0)
);

-- 9. Gateway Bills
CREATE TABLE gateway_bills (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    amount_sen BIGINT NOT NULL CHECK (amount_sen > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Audit Log
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is append-only for everyone (including db owner and service role)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-------------------------------------------------------------------------------
-- Storage Bucket: payment-slips (private)
-------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-slips',
    'payment-slips',
    false,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

-------------------------------------------------------------------------------
-- Helper Functions for Row Level Security (RLS)
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_member_org()
RETURNS TEXT AS $$
    SELECT org_id FROM public.memberships WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.memberships WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS TEXT AS $$
    SELECT id FROM public.tenants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_tenant_org()
RETURNS TEXT AS $$
    SELECT org_id FROM public.tenants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-------------------------------------------------------------------------------
-- Enable Row Level Security (RLS)
-------------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 1. organizations
CREATE POLICY "org_select" ON organizations FOR SELECT
USING (id = get_user_member_org() OR id = get_user_tenant_org());

-- 2. memberships (staff, manager can read own organization)
CREATE POLICY "memberships_select" ON memberships FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

-- 3. units
-- Staff and manager: read own organization
CREATE POLICY "units_select_staff_mgr" ON units FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

-- Tenant: read the units of own leases
CREATE POLICY "units_select_tenant" ON units FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leases
        WHERE leases.unit_id = units.id
        AND leases.tenant_id = get_user_tenant_id()
    )
);

-- 4. tenants
-- Staff and manager: read own organization
CREATE POLICY "tenants_select_staff_mgr" ON tenants FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

-- Tenant: read own row
CREATE POLICY "tenants_select_tenant" ON tenants FOR SELECT
USING (user_id = auth.uid());

-- Tenant: update ONLY phone
CREATE POLICY "tenants_update_tenant_phone" ON tenants FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    AND id = (SELECT id FROM public.tenants WHERE user_id = auth.uid())
    AND org_id = (SELECT org_id FROM public.tenants WHERE user_id = auth.uid())
    AND full_name = (SELECT full_name FROM public.tenants WHERE user_id = auth.uid())
    AND email = (SELECT email FROM public.tenants WHERE user_id = auth.uid())
);

-- 5. leases
CREATE POLICY "leases_select_staff_mgr" ON leases FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

CREATE POLICY "leases_select_tenant" ON leases FOR SELECT
USING (tenant_id = get_user_tenant_id());

-- 6. invoices
CREATE POLICY "invoices_select_staff_mgr" ON invoices FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

CREATE POLICY "invoices_select_tenant" ON invoices FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leases
        WHERE leases.id = invoices.lease_id
        AND leases.tenant_id = get_user_tenant_id()
    )
);

-- 7. payments
CREATE POLICY "payments_select_staff_mgr" ON payments FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

CREATE POLICY "payments_select_tenant" ON payments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leases
        WHERE leases.id = payments.lease_id
        AND leases.tenant_id = get_user_tenant_id()
    )
);

-- 8. payment_allocations
CREATE POLICY "allocations_select_staff_mgr" ON payment_allocations FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

CREATE POLICY "allocations_select_tenant" ON payment_allocations FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.invoices
        JOIN public.leases ON leases.id = invoices.lease_id
        WHERE invoices.id = payment_allocations.invoice_id
        AND leases.tenant_id = get_user_tenant_id()
    )
);

-- 9. gateway_bills
CREATE POLICY "bills_select_staff_mgr" ON gateway_bills FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() IN ('manager', 'staff'));

CREATE POLICY "bills_select_tenant" ON gateway_bills FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leases
        WHERE leases.id = gateway_bills.lease_id
        AND leases.tenant_id = get_user_tenant_id()
    )
);

-- 10. audit_log (manager only)
CREATE POLICY "audit_log_select_mgr" ON audit_log FOR SELECT
USING (org_id = get_user_member_org() AND get_user_role() = 'manager');

-------------------------------------------------------------------------------
-- Storage Policies for payment-slips
-- Under <org_id>/...
-------------------------------------------------------------------------------
CREATE POLICY "slips_staff_mgr_select"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'payment-slips'
    AND (storage.foldername(name))[1] = get_user_member_org()
    AND get_user_role() IN ('manager', 'staff')
);

CREATE POLICY "slips_staff_mgr_insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'payment-slips'
    AND (storage.foldername(name))[1] = get_user_member_org()
    AND get_user_role() IN ('manager', 'staff')
);
