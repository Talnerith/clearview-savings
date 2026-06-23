import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  caregivers,
  patients,
  scheduledDeposits,
  transactions,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { materializeScheduledDeposits } from "./materialize";

async function seedPatientWithMonthlyDeposit(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "test@example.com" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ caregiverId: caregiver!.id, displayName: "Mom" })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({
      patientId: patient!.id,
      name: "Checking",
      type: "checking",
      balanceCents: 120000,
    })
    .returning();
  const [deposit] = await db
    .insert(scheduledDeposits)
    .values({
      accountId: account!.id,
      label: "Pension",
      amountCents: 180000,
      frequency: "monthly",
      anchorDate: "2026-01-01",
      nextRunAt: "2026-01-01",
    })
    .returning();

  return {
    patientId: patient!.id,
    accountId: account!.id,
    depositId: deposit!.id,
  };
}

describe("materializeScheduledDeposits", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("creates a transaction for each due occurrence and advances next_run_at", async () => {
    const { patientId, accountId } = await seedPatientWithMonthlyDeposit(db);

    await materializeScheduledDeposits(db, patientId, {
      now: new Date("2026-04-15T12:00:00Z"),
    });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs.map((t) => t.scheduledOccurrenceDate).sort()).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(120000 + 180000 * 4);

    const [scheduled] = await db.select().from(scheduledDeposits);
    expect(scheduled!.nextRunAt).toBe("2026-05-01");
  });

  it("is idempotent — running twice does not duplicate transactions or balances", async () => {
    const { patientId, accountId } = await seedPatientWithMonthlyDeposit(db);
    const now = new Date("2026-04-15T12:00:00Z");

    await materializeScheduledDeposits(db, patientId, { now });
    await materializeScheduledDeposits(db, patientId, { now });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(4);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(120000 + 180000 * 4);
  });

  it("does nothing when no occurrences are due yet", async () => {
    const { patientId, accountId } = await seedPatientWithMonthlyDeposit(db);

    await materializeScheduledDeposits(db, patientId, {
      now: new Date("2025-12-15T12:00:00Z"),
    });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(0);

    const [scheduled] = await db.select().from(scheduledDeposits);
    expect(scheduled!.nextRunAt).toBe("2026-01-01");
  });

  it("ignores inactive scheduled deposits", async () => {
    const { patientId, accountId, depositId } =
      await seedPatientWithMonthlyDeposit(db);
    await db
      .update(scheduledDeposits)
      .set({ active: false })
      .where(eq(scheduledDeposits.id, depositId));

    await materializeScheduledDeposits(db, patientId, {
      now: new Date("2026-04-15T12:00:00Z"),
    });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(0);
  });
});
