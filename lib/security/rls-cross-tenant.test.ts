import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  auditLog,
  caregivers,
  depositCodes,
  patients,
  scheduledDeposits,
  transactions,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

// Emulated RLS test — pg-mem does not honor Postgres RLS policies natively,
// so this file pins down the *shape* of each policy's USING / WITH CHECK
// scope clause: for every table, run the same WHERE filter the production
// policy expands to, and assert it admits the owning caregiver's row and
// rejects the other caregiver's row. This catches policy-logic regressions
// at the SQL-shape level; the actual-RLS-engine enforcement is exercised
// by `rls-cross-tenant.real.test.ts` against a real Postgres container.

// Scope WHERE fragment per table, mirroring supabase/policies.sql exactly.
// Parameter $1 is the caregiver's `auth.uid()` value (i.e. user_id).
const SCOPE_BY_USER_ID: Record<string, string> = {
  caregivers: "user_id = $1",
  patients: "caregiver_id IN (SELECT id FROM caregivers WHERE user_id = $1)",
  accounts: `patient_id IN (
    SELECT p.id FROM patients p
    JOIN caregivers c ON c.id = p.caregiver_id
    WHERE c.user_id = $1
  )`,
  transactions: `account_id IN (
    SELECT a.id FROM accounts a
    JOIN patients p ON p.id = a.patient_id
    JOIN caregivers c ON c.id = p.caregiver_id
    WHERE c.user_id = $1
  )`,
  scheduled_deposits: `account_id IN (
    SELECT a.id FROM accounts a
    JOIN patients p ON p.id = a.patient_id
    JOIN caregivers c ON c.id = p.caregiver_id
    WHERE c.user_id = $1
  )`,
  deposit_codes: `patient_id IN (
    SELECT p.id FROM patients p
    JOIN caregivers c ON c.id = p.caregiver_id
    WHERE c.user_id = $1
  )`,
  audit_log: "caregiver_id IN (SELECT id FROM caregivers WHERE user_id = $1)",
};

type Fixture = {
  userId: string;
  caregiverId: string;
  patientId: string;
  accountId: string;
  transactionId: string;
  scheduledDepositId: string;
  depositCodeId: string;
  auditLogId: string;
};

async function createCaregiverChain(
  db: TestDb,
  email: string,
): Promise<Fixture> {
  const userId = crypto.randomUUID();

  const [c] = await db
    .insert(caregivers)
    .values({ userId, email })
    .returning();
  const caregiverId = c!.id;

  const [p] = await db
    .insert(patients)
    .values({ caregiverId, displayName: `Patient of ${email}` })
    .returning();
  const patientId = p!.id;

  const [a] = await db
    .insert(accounts)
    .values({
      patientId,
      name: "Checking",
      type: "checking",
      balanceCents: 100_000,
    })
    .returning();
  const accountId = a!.id;

  const [t] = await db
    .insert(transactions)
    .values({
      accountId,
      kind: "deposit",
      amountCents: 50_000,
      label: "seed",
      postedAt: new Date("2026-05-16T00:00:00Z"),
      source: "manual",
    })
    .returning();
  const transactionId = t!.id;

  const [sd] = await db
    .insert(scheduledDeposits)
    .values({
      accountId,
      label: "Pension",
      amountCents: 180_000,
      frequency: "monthly",
      anchorDate: "2026-05-01",
      nextRunAt: "2026-06-01",
    })
    .returning();
  const scheduledDepositId = sd!.id;

  const [dc] = await db
    .insert(depositCodes)
    .values({
      patientId,
      code: `C-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      amountCents: 5_000,
      kind: "check",
      label: "test check",
    })
    .returning();
  const depositCodeId = dc!.id;

  const [al] = await db
    .insert(auditLog)
    .values({
      caregiverId,
      patientId,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: patientId,
    })
    .returning();
  const auditLogId = al!.id;

  return {
    userId,
    caregiverId,
    patientId,
    accountId,
    transactionId,
    scheduledDepositId,
    depositCodeId,
    auditLogId,
  };
}

// Returns the number of rows in `table` whose id matches `targetId` AND
// the production policy's USING clause would admit (evaluated against
// `asUserId` as `auth.uid()`). Production cross-tenant access surfaces as
// `count === 0` in this matrix.
async function scopedCount(
  db: TestDb,
  table: string,
  targetId: string,
  asUserId: string,
): Promise<number> {
  const scope = SCOPE_BY_USER_ID[table];
  if (!scope) throw new Error(`no scope clause for ${table}`);
  const query = `SELECT COUNT(*)::int AS n FROM ${table} WHERE id = $1 AND ${scope.replace("$1", "$2")}`;
  const result = await db.execute(sql.raw(query.replace("$1", `'${targetId}'`).replace("$2", `'${asUserId}'`)));
  // pg-mem returns rows as arrays via the test fixture's positional-row
  // conversion; the first column of the first row is the count.
  const rows = (result as unknown as { rows: unknown[] }).rows ?? [];
  const first = rows[0];
  if (Array.isArray(first)) return Number(first[0]);
  if (first && typeof first === "object" && "n" in first) {
    return Number((first as { n: unknown }).n);
  }
  return 0;
}

const TABLES: Array<{ name: string; idKey: keyof Fixture }> = [
  { name: "caregivers", idKey: "caregiverId" },
  { name: "patients", idKey: "patientId" },
  { name: "accounts", idKey: "accountId" },
  { name: "transactions", idKey: "transactionId" },
  { name: "scheduled_deposits", idKey: "scheduledDepositId" },
  { name: "deposit_codes", idKey: "depositCodeId" },
  { name: "audit_log", idKey: "auditLogId" },
];

describe("RLS cross-tenant (emulated) — policy USING clause shape", () => {
  let db: TestDb;
  let A: Fixture;
  let B: Fixture;

  beforeEach(async () => {
    db = await createInMemoryDb();
    A = await createCaregiverChain(db, "a@example.test");
    B = await createCaregiverChain(db, "b@example.test");
  });

  for (const { name, idKey } of TABLES) {
    describe(name, () => {
      it("caregiver A sees their own row", async () => {
        expect(await scopedCount(db, name, A[idKey], A.userId)).toBe(1);
      });

      it("caregiver B sees their own row", async () => {
        expect(await scopedCount(db, name, B[idKey], B.userId)).toBe(1);
      });

      it("caregiver A cannot see B's row", async () => {
        expect(await scopedCount(db, name, B[idKey], A.userId)).toBe(0);
      });

      it("caregiver B cannot see A's row", async () => {
        expect(await scopedCount(db, name, A[idKey], B.userId)).toBe(0);
      });
    });
  }
});
