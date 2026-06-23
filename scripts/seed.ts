import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import {
  accounts,
  caregivers,
  depositCodes,
  patients,
  scheduledDeposits,
} from "../lib/db/schema";
import { generateCode } from "../lib/deposit-codes";

loadEnv({ path: ".env.local" });

const DEFAULT_EMAIL = "demo@clearview-savings.test";
const DEFAULT_PASSWORD = "DemoPassword123!";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
}

function firstOfCurrentMonth(today: Date = new Date()): string {
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

async function findAuthUser(
  supabase: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<User> {
  const existing = await findAuthUser(supabase, email);
  if (existing) {
    console.log(`Auth user ${email} already exists; updating password.`);
    const { data, error } = await supabase.auth.admin.updateUserById(
      existing.id,
      { password, email_confirm: true },
    );
    if (error) throw error;
    return data.user;
  }

  console.log(`Creating auth user ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user;
}

async function main(): Promise<void> {
  const email = process.env.CLEARVIEW_SAVINGS_DEMO_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.CLEARVIEW_SAVINGS_DEMO_PASSWORD ?? DEFAULT_PASSWORD;
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseSecret = requireEnv("SUPABASE_SECRET_KEY");
  const databaseUrl = requireEnv("DATABASE_URL");

  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await ensureAuthUser(supabase, email, password);
  console.log(`Auth user id: ${user.id}`);

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  const db = drizzle(sql);

  try {
    const existingCaregiver = await db
      .select()
      .from(caregivers)
      .where(eq(caregivers.userId, user.id))
      .limit(1);

    let caregiver = existingCaregiver[0];
    if (!caregiver) {
      console.log("Creating caregiver row...");
      const inserted = await db
        .insert(caregivers)
        .values({ userId: user.id, email })
        .returning();
      caregiver = inserted[0];
    }
    if (!caregiver) throw new Error("Failed to upsert caregiver row");

    // Wipe any existing demo data for this caregiver. Cascades delete
    // accounts, transactions, scheduled_deposits, deposit_codes.
    console.log("Resetting demo patients for this caregiver...");
    await db.delete(patients).where(eq(patients.caregiverId, caregiver.id));

    console.log("Inserting demo patient...");
    const insertedPatient = await db
      .insert(patients)
      .values({ caregiverId: caregiver.id, displayName: "Demo Patient" })
      .returning();
    const patient = insertedPatient[0];
    if (!patient) throw new Error("Failed to insert patient");

    console.log("Inserting Checking account with $1,200 balance...");
    const insertedAccount = await db
      .insert(accounts)
      .values({
        patientId: patient.id,
        name: "Checking",
        type: "checking",
        balanceCents: 120_000,
      })
      .returning();
    const account = insertedAccount[0];
    if (!account) throw new Error("Failed to insert account");

    const anchor = firstOfCurrentMonth();
    console.log(
      `Inserting monthly Pension scheduled deposit ($1,800) anchored to ${anchor}...`,
    );
    await db.insert(scheduledDeposits).values({
      accountId: account.id,
      label: "Pension",
      amountCents: 180_000,
      frequency: "monthly",
      anchorDate: anchor,
      nextRunAt: anchor,
    });

    // Two example unused checks so the patient deposit flow is testable from
    // a fresh seed without first signing in as the caregiver. Codes are
    // generated once here and printed below so the developer can paste them
    // into the patient wizard's code field.
    console.log("Inserting two example unused checks...");
    const birthdayCode = generateCode();
    const pocketMoneyCode = generateCode();
    await db.insert(depositCodes).values([
      {
        patientId: patient.id,
        code: birthdayCode,
        amountCents: 5_000,
        kind: "check",
        label: "Birthday from Aunt Susan",
      },
      {
        patientId: patient.id,
        code: pocketMoneyCode,
        amountCents: 2_000,
        kind: "check",
        label: "Pocket money",
      },
    ]);

    console.log("");
    console.log("Seed complete.");
    console.log("---------------------------------");
    console.log(`Caregiver email:    ${email}`);
    console.log(`Caregiver password: ${password}`);
    console.log(`Sign in at:         /sign-in`);
    console.log(`Patient view URL:   /patient/${patient.id}`);
    console.log("---------------------------------");
    console.log("Example unused deposit codes (kind=check):");
    console.log(`  Birthday from Aunt Susan ($50.00):  ${birthdayCode}`);
    console.log(`  Pocket money ($20.00):              ${pocketMoneyCode}`);
    console.log("---------------------------------");
    console.log(
      "Note: the Pension is anchored to the 1st of the current month, so the " +
        "first occurrence is materialized on the next page load.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
