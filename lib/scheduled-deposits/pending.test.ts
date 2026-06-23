import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  caregivers,
  patients,
  scheduledDeposits,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { getPendingDeposits } from "./pending";

const NOW = new Date("2026-05-11T12:00:00Z");

function offsetDateString(daysFromNow: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function seed(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "test@example.com" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ caregiverId: caregiver!.id, displayName: "Mom" })
    .returning();
  const [checking] = await db
    .insert(accounts)
    .values({
      patientId: patient!.id,
      name: "Checking",
      type: "checking",
      balanceCents: 0,
    })
    .returning();
  const [savings] = await db
    .insert(accounts)
    .values({
      patientId: patient!.id,
      name: "Savings",
      type: "savings",
      balanceCents: 0,
    })
    .returning();
  return {
    patientId: patient!.id,
    checkingId: checking!.id,
    savingsId: savings!.id,
  };
}

async function addScheduled(
  db: TestDb,
  args: {
    accountId: string;
    label: string;
    daysFromNow: number;
    pendingDays: number;
    active?: boolean;
  },
) {
  const next = offsetDateString(args.daysFromNow);
  const [row] = await db
    .insert(scheduledDeposits)
    .values({
      accountId: args.accountId,
      label: args.label,
      amountCents: 100_000,
      frequency: "monthly",
      anchorDate: next,
      nextRunAt: next,
      pendingDays: args.pendingDays,
      active: args.active ?? true,
    })
    .returning();
  return row!;
}

describe("getPendingDeposits", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  // Spec acceptance criterion examples — locking the contract.
  it("returns the deposit when nextRunAt is within the window", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 3,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Pension");
    expect(items[0]!.accountName).toBe("Checking");
  });

  it("excludes the deposit when nextRunAt is past the window", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 7,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toEqual([]);
  });

  it("includes a deposit due today", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 0,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toHaveLength(1);
  });

  it("includes a deposit at exactly the window edge (daysAway === pendingDays)", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 5,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toHaveLength(1);
  });

  it("excludes inactive scheduled deposits regardless of window", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 1,
      pendingDays: 5,
      active: false,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toEqual([]);
  });

  it("honors per-row pending_days — same nextRunAt, different windows", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Narrow",
      daysFromNow: 5,
      pendingDays: 3,
    });
    await addScheduled(db, {
      accountId: checkingId,
      label: "Wide",
      daysFromNow: 5,
      pendingDays: 7,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items.map((i) => i.label)).toEqual(["Wide"]);
  });

  it("scopes by patient — does not leak deposits from other patients", async () => {
    const a = await seed(db);
    const b = await seed(db);
    await addScheduled(db, {
      accountId: a.checkingId,
      label: "A's Pension",
      daysFromNow: 2,
      pendingDays: 5,
    });
    await addScheduled(db, {
      accountId: b.checkingId,
      label: "B's Pension",
      daysFromNow: 2,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, a.patientId, NOW);
    expect(items.map((i) => i.label)).toEqual(["A's Pension"]);
  });

  it("returns deposits ordered by nextRunAt ascending", async () => {
    const { patientId, checkingId, savingsId } = await seed(db);
    await addScheduled(db, {
      accountId: savingsId,
      label: "Later",
      daysFromNow: 4,
      pendingDays: 14,
    });
    await addScheduled(db, {
      accountId: checkingId,
      label: "Sooner",
      daysFromNow: 1,
      pendingDays: 14,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items.map((i) => i.label)).toEqual(["Sooner", "Later"]);
  });

  it("returns empty array when patient has no scheduled deposits", async () => {
    const { patientId } = await seed(db);
    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toEqual([]);
  });

  it("includes the destination account name on each item", async () => {
    const { patientId, savingsId } = await seed(db);
    await addScheduled(db, {
      accountId: savingsId,
      label: "Pension",
      daysFromNow: 1,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items[0]!.accountName).toBe("Savings");
    expect(items[0]!.accountId).toBe(savingsId);
  });

  // Defensive — materialize advances next_run_at past today before this is
  // called, but if there's a race we'd rather skip than show a negative.
  it("excludes a deposit whose nextRunAt is in the past", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Stale",
      daysFromNow: -2,
      pendingDays: 5,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toEqual([]);
  });

  // Smoke test: window=0 means "show only on the day of"
  it("window=0 includes today but excludes tomorrow", async () => {
    const { patientId, checkingId } = await seed(db);
    await addScheduled(db, {
      accountId: checkingId,
      label: "Today only",
      daysFromNow: 0,
      pendingDays: 0,
    });
    await addScheduled(db, {
      accountId: checkingId,
      label: "Tomorrow",
      daysFromNow: 1,
      pendingDays: 0,
    });

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items.map((i) => i.label)).toEqual(["Today only"]);
  });

  // Verify the seed query is functioning as expected — keeps unrelated rows
  // out of the result regardless of patient scoping.
  it("does not include scheduled deposits with a deleted account when patient remains", async () => {
    const { patientId, checkingId } = await seed(db);
    const sd = await addScheduled(db, {
      accountId: checkingId,
      label: "Pension",
      daysFromNow: 1,
      pendingDays: 5,
    });
    void sd;
    await db.delete(accounts).where(eq(accounts.id, checkingId));

    const items = await getPendingDeposits(db, patientId, NOW);
    expect(items).toEqual([]);
  });
});

