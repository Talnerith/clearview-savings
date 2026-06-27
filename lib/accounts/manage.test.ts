import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { accounts, auditLog, caregivers, patients, transactions } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { addAccount, renameAccount } from "./manage";

async function seedPatient(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "cg@example.com" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ caregiverId: caregiver!.id, displayName: "Mom" })
    .returning();
  const [checking] = await db
    .insert(accounts)
    .values({ patientId: patient!.id, name: "Checking", type: "checking" })
    .returning();
  return { caregiverId: caregiver!.id, patientId: patient!.id, checkingId: checking!.id };
}

describe("addAccount", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("creates a savings account with an opening adjustment when a balance is given", async () => {
    const s = await seedPatient(db);
    const acct = await addAccount(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      name: "Savings",
      startingBalance: "500.00",
    });
    expect(acct.type).toBe("savings");
    expect(acct.balanceCents).toBe(50_000);

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, acct.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.label).toBe("Opening balance");
    expect(txs[0]!.amountCents).toBe(50_000);
  });

  it("creates no opening transaction for a zero starting balance", async () => {
    const s = await seedPatient(db);
    const acct = await addAccount(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      name: "Savings",
      startingBalance: "0",
    });
    expect(acct.balanceCents).toBe(0);
    expect(
      await db.select().from(transactions).where(eq(transactions.accountId, acct.id)),
    ).toHaveLength(0);
  });

  it("rejects a second savings account", async () => {
    const s = await seedPatient(db);
    await addAccount(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      name: "Savings",
      startingBalance: "0",
    });
    await expect(
      addAccount(db, {
        caregiverId: s.caregiverId,
        patientId: s.patientId,
        name: "Savings 2",
        startingBalance: "0",
      }),
    ).rejects.toThrow("A savings account already exists.");
  });
});

describe("renameAccount", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("renames and writes an audit row", async () => {
    const s = await seedPatient(db);
    const updated = await renameAccount(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      accountId: s.checkingId,
      name: "Everyday",
    });
    expect(updated?.name).toBe("Everyday");
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("is a no-op (null, no audit) when the name is unchanged", async () => {
    const s = await seedPatient(db);
    const updated = await renameAccount(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      accountId: s.checkingId,
      name: "Checking",
    });
    expect(updated).toBeNull();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("rejects an account that doesn't belong to the patient", async () => {
    const a = await seedPatient(db);
    const b = await seedPatient(db);
    await expect(
      renameAccount(db, {
        caregiverId: a.caregiverId,
        patientId: a.patientId,
        accountId: b.checkingId,
        name: "Hacked",
      }),
    ).rejects.toThrow("Account does not belong to this patient.");
  });
});
