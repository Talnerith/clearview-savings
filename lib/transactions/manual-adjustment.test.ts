import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { accounts, auditLog, caregivers, patients, transactions } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { applyManualAdjustment } from "./manual-adjustment";

async function seedPatientWithAccount(db: TestDb) {
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
      balanceCents: 100_000,
    })
    .returning();
  return {
    caregiverId: caregiver!.id,
    patientId: patient!.id,
    accountId: checking!.id,
  };
}

describe("applyManualAdjustment — sign convention", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("a deposit increases the balance and posts a positive transaction", async () => {
    const seed = await seedPatientWithAccount(db);
    const tx = await applyManualAdjustment(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      accountId: seed.accountId,
      kind: "deposit",
      amount: "50.00",
      label: "Birthday",
    });

    expect(tx.amountCents).toBe(5_000);
    expect(tx.kind).toBe("deposit");
    expect(tx.source).toBe("manual");
    const [acct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, seed.accountId));
    expect(acct!.balanceCents).toBe(105_000);
  });

  it("a withdrawal and a fee both decrease the balance", async () => {
    const seed = await seedPatientWithAccount(db);
    await applyManualAdjustment(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      accountId: seed.accountId,
      kind: "withdrawal",
      amount: "10.00",
      label: "Cash",
    });
    await applyManualAdjustment(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      accountId: seed.accountId,
      kind: "fee",
      amount: "2.50",
      label: "Service fee",
    });

    const [acct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, seed.accountId));
    expect(acct!.balanceCents).toBe(100_000 - 1_000 - 250);
  });

  it("an adjustment honors the increase/decrease direction", async () => {
    const seed = await seedPatientWithAccount(db);
    const down = await applyManualAdjustment(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      accountId: seed.accountId,
      kind: "adjustment",
      amount: "5.00",
      label: "Correction",
      direction: "decrease",
    });
    expect(down.amountCents).toBe(-500);
  });
});

describe("applyManualAdjustment — ownership + audit", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("writes exactly one audit row pointing at the inserted transaction", async () => {
    const seed = await seedPatientWithAccount(db);
    const tx = await applyManualAdjustment(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      accountId: seed.accountId,
      kind: "deposit",
      amount: "12.34",
      label: "Misc",
    });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionKind).toBe("transaction_created");
    expect(rows[0]!.targetKind).toBe("transaction");
    expect(rows[0]!.targetId).toBe(tx.id);
    expect(rows[0]!.caregiverId).toBe(seed.caregiverId);
    expect(rows[0]!.patientId).toBe(seed.patientId);
  });

  it("rejects an account that does not belong to the patient — no writes", async () => {
    const a = await seedPatientWithAccount(db);
    const b = await seedPatientWithAccount(db);

    await expect(
      applyManualAdjustment(db, {
        caregiverId: a.caregiverId,
        patientId: a.patientId,
        accountId: b.accountId, // another patient's account
        kind: "deposit",
        amount: "10.00",
        label: "Cross-tenant",
      }),
    ).rejects.toThrow("Account does not belong to this patient.");

    // The guard throws before any insert, so nothing is written.
    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});
