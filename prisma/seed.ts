import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createAdminClient } from "../lib/supabase/service-role";
import { createLease } from "../lib/leases";
import { recordPayment, approvePayment } from "../lib/payments";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

import type { SupabaseClient, User } from "@supabase/supabase-js";

const PASSWORD = "Password123!";

async function getOrCreateAuthUser(supabase: SupabaseClient | null, email: string): Promise<string> {
  if (supabase) {
    try {
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((u: User) => u.email === email);
      if (existing) return existing.id;

      const { data: createData } = await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (createData?.user?.id) return createData.user.id;
    } catch (e) {
      console.warn(`Could not sync ${email} to Supabase Auth:`, e);
    }
  }

  // Deterministic UUID fallback
  const map: Record<string, string> = {
    "manager@northwind.test": "11111111-1111-1111-1111-111111111101",
    "staff@northwind.test": "11111111-1111-1111-1111-111111111102",
    "aisyah@northwind.test": "11111111-1111-1111-1111-111111111103",
    "ben@northwind.test": "11111111-1111-1111-1111-111111111104",
    "probe@northwind.test": "11111111-1111-1111-1111-111111111105",
    "manager@beta.test": "22222222-2222-2222-2222-222222222201",
    "chen@beta.test": "22222222-2222-2222-2222-222222222202",
  };
  return map[email] || "33333333-3333-3333-3333-333333333301";
}

async function main() {
  console.log("🌱 Starting Official Assessment Seed Data...");

  let supabase: SupabaseClient | null = null;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.warn("Supabase admin credentials not loaded, proceeding with database client");
  }

  // 1. Clean existing records in reverse relation order using TRUNCATE CASCADE
  console.log("Cleaning database tables...");
  await pool.query(`
    TRUNCATE TABLE payment_allocations, payments, gateway_bills, invoices, leases, units, tenants, memberships, audit_log, organizations CASCADE;
  `);

  // 2. Organizations
  console.log("Creating Organizations...");
  const orgNorthwind = await prisma.organization.create({
    data: { id: "org_northwind", name: "Northwind Properties" },
  });

  const orgBeta = await prisma.organization.create({
    data: { id: "org_beta", name: "Beta Realty" },
  });

  // Ensure slip upload file exists in storage for Northwind
  const slipPath = `${orgNorthwind.id}/aisyah_transfer_slip.png`;
  if (supabase) {
    try {
      const dummyBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      await supabase.storage.from("payment-slips").upload(slipPath, dummyBuffer, {
        contentType: "image/png",
        upsert: true,
      });
      console.log(`Uploaded test bank slip to storage at ${slipPath}`);
    } catch (e) {
      console.warn("Storage upload warning:", e);
    }
  }

  // 3. Accounts & Memberships / Tenants
  console.log("Creating Accounts and Memberships...");
  // Northwind accounts
  const nwMgrUserId = await getOrCreateAuthUser(supabase, "manager@northwind.test");
  const nwStfUserId = await getOrCreateAuthUser(supabase, "staff@northwind.test");
  const aisyahUserId = await getOrCreateAuthUser(supabase, "aisyah@northwind.test");
  const benUserId = await getOrCreateAuthUser(supabase, "ben@northwind.test");
  const probeUserId = await getOrCreateAuthUser(supabase, "probe@northwind.test");

  // Beta accounts
  const betaMgrUserId = await getOrCreateAuthUser(supabase, "manager@beta.test");
  const chenUserId = await getOrCreateAuthUser(supabase, "chen@beta.test");

  // Memberships
  await prisma.membership.createMany({
    data: [
      { userId: nwMgrUserId, orgId: orgNorthwind.id, role: "manager" },
      { userId: nwStfUserId, orgId: orgNorthwind.id, role: "staff" },
      { userId: betaMgrUserId, orgId: orgBeta.id, role: "manager" },
    ],
  });

  // Tenants
  const tenantAisyah = await prisma.tenant.create({
    data: {
      id: "tnt_aisyah",
      orgId: orgNorthwind.id,
      userId: aisyahUserId,
      fullName: "Aisyah Rahman",
      email: "aisyah@northwind.test",
      phone: "+60 12-345 6789",
    },
  });

  const tenantBen = await prisma.tenant.create({
    data: {
      id: "tnt_ben",
      orgId: orgNorthwind.id,
      userId: benUserId,
      fullName: "Ben Lim",
      email: "ben@northwind.test",
      phone: "+60 13-456 7890",
    },
  });

  const tenantProbe = await prisma.tenant.create({
    data: {
      id: "tnt_probe",
      orgId: orgNorthwind.id,
      userId: probeUserId,
      fullName: "Probe Tenant",
      email: "probe@northwind.test",
      phone: "+60 14-567 8901",
    },
  });

  const tenantChen = await prisma.tenant.create({
    data: {
      id: "tnt_chen",
      orgId: orgBeta.id,
      userId: chenUserId,
      fullName: "Chen Wei",
      email: "chen@beta.test",
      phone: "+60 15-678 9012",
    },
  });

  // 4. Units
  console.log("Creating Units...");
  const unitA123 = await prisma.unit.create({
    data: { id: "unit_A_12_3", orgId: orgNorthwind.id, name: "A-12-3" },
  });
  const unitB051 = await prisma.unit.create({
    data: { id: "unit_B_05_1", orgId: orgNorthwind.id, name: "B-05-1" },
  });
  const unitC017 = await prisma.unit.create({
    data: { id: "unit_C_01_7", orgId: orgNorthwind.id, name: "C-01-7" },
  });
  await prisma.unit.create({
    data: { id: "unit_D_03_2", orgId: orgNorthwind.id, name: "D-03-2" }, // Vacant, no lease
  });
  const unitKL1 = await prisma.unit.create({
    data: { id: "unit_KL_1", orgId: orgBeta.id, name: "KL-1" },
  });

  // 5. Leases (Created through normal business logic createLease)
  console.log("Creating Leases and generating invoice schedules...");
  // Northwind Lease 1: Aisyah Rahman (2026-01-31 to 2026-07-15, RM 1500, Deposit RM 3000)
  const aisyahLease = await createLease({
    orgId: orgNorthwind.id,
    actorId: nwMgrUserId,
    unitId: unitA123.id,
    tenantId: tenantAisyah.id,
    startDate: "2026-01-31",
    endDate: "2026-07-15",
    monthlyRentSen: 150000,
    depositSen: 300000,
  });

  // Northwind Lease 2: Ben Lim (2026-01-01 to 2026-04-15, RM 1000.29, No deposit)
  await createLease({
    orgId: orgNorthwind.id,
    actorId: nwMgrUserId,
    unitId: unitB051.id,
    tenantId: tenantBen.id,
    startDate: "2026-01-01",
    endDate: "2026-04-15",
    monthlyRentSen: 100029,
    depositSen: 0,
  });

  // Northwind Lease 3: Probe Tenant (2026-02-28 to 2027-02-27, RM 2000, Deposit RM 4000)
  await createLease({
    orgId: orgNorthwind.id,
    actorId: nwMgrUserId,
    unitId: unitC017.id,
    tenantId: tenantProbe.id,
    startDate: "2026-02-28",
    endDate: "2027-02-27",
    monthlyRentSen: 200000,
    depositSen: 400000,
  });

  // Beta Lease 1: Chen Wei (2026-03-15 to 2027-03-14, RM 2200, Deposit RM 4400)
  await createLease({
    orgId: orgBeta.id,
    actorId: betaMgrUserId,
    unitId: unitKL1.id,
    tenantId: tenantChen.id,
    startDate: "2026-03-15",
    endDate: "2027-03-14",
    monthlyRentSen: 220000,
    depositSen: 440000,
  });

  // 6. Payments on Aisyah's lease (Section 2)
  console.log("Recording payments on Aisyah's lease...");
  // Payment 1: Cash, RM 3,000.00, received 2026-01-31 10:00 Malaysia time (+0800), recorded by manager
  await recordPayment({
    orgId: orgNorthwind.id,
    actorId: nwMgrUserId,
    role: "manager",
    leaseId: aisyahLease.id,
    amountSen: 300000,
    method: "cash",
    receivedAt: "2026-01-31T02:00:00.000Z", // 2026-01-31 10:00:00 MYT (+08:00)
  });

  // Payment 2: Bank transfer, RM 2,000.00, received 2026-03-01 00:30 Malaysia time (+0800), recorded by staff with slip, approved by manager
  const staffPayment = await recordPayment({
    orgId: orgNorthwind.id,
    actorId: nwStfUserId,
    role: "staff",
    leaseId: aisyahLease.id,
    amountSen: 200000,
    method: "bank_transfer",
    receivedAt: "2026-02-28T16:30:00.000Z", // 2026-03-01 00:30:00 MYT (+08:00)
    slipPath,
  });

  // Manager approves staff payment
  await approvePayment({
    orgId: orgNorthwind.id,
    actorId: nwMgrUserId,
    paymentId: staffPayment.id,
  });

  console.log("\n✅ Official Seed Data completed successfully!");
  console.log(`- Seed password for all accounts: ${PASSWORD}`);
  console.log(`- Created 2 organizations: Northwind Properties, Beta Realty`);
  console.log(`- Created 7 accounts (2 managers, 1 staff, 4 tenants)`);
  console.log(`- Created 5 units (4 Northwind, 1 Beta)`);
  console.log(`- Created 4 leases with full invoice schedules`);
  console.log(`- Created 2 payments on Aisyah's lease (1 Cash RM 3,000, 1 Bank Transfer RM 2,000 approved)`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });