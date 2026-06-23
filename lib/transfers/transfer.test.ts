import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  auditLog,
  caregivers,
  patients,
  transactions,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { performTransfer } from "./transfer";

async function seedPatientWithTwoAccounts(db: TestDb) {
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
  const [savings] = await db
    .insert(accounts)
    .values({
      patientId: patient!.id,
      name: "Savings",
      type: "savings",
      balanceCents: 25_000,
    })
    .returning();
  return {
    caregiverId: caregiver!.id,
    patientId: patient!.id,
    checkingId: checking!.id,
    savingsId: savings!.id,
  };
}

// Smoke tests for the test backend. The fixture (`lib/test/pg-mem.ts`)
// uses drizzle's node-postgres adapter on top of pg-mem.
//
// Two confirmed-known limits of pg-mem we lock in here so a future change
// flags loudly:
//   - COMMIT works: a successful db.transaction() persists writes.
//   - ROLLBACK does NOT undo INSERTed rows. Rolling back after a throw
//     leaves the rows present. This means real atomicity (mid-operation
//     failure rolls back partial writes) cannot be verified on pg-mem;
//     guard-ordered tests verify the related "throw before write = no
//     writes committed" invariant instead. See docs/gotchas.md.
describe("test backend: db.transaction() semantics", () => {
  it("commits inserts when the transaction returns normally", async () => {
    const db = await createInMemoryDb();
    const [caregiver] = await db
      .insert(caregivers)
      .values({ userId: crypto.randomUUID(), email: "tx-ok@example.com" })
      .returning();
    const sentinel = "tx-commit-probe";

    await db.transaction(async (tx) => {
      await tx
        .insert(patients)
        .values({ caregiverId: caregiver!.id, displayName: sentinel });
    });

    const rows = await db.select().from(patients);
    expect(rows.find((p) => p.displayName === sentinel)).toBeDefined();
  });

  // Inverted assertion: pg-mem currently leaves INSERTed rows present
  // after ROLLBACK. The day pg-mem honors ROLLBACK, this test will fail
  // and we can convert it to a positive assertion plus graduate the
  // guard-ordered transfer tests to true atomicity tests.
  it("documents that pg-mem does NOT roll back INSERTs (canary)", async () => {
    const db = await createInMemoryDb();
    const [caregiver] = await db
      .insert(caregivers)
      .values({ userId: crypto.randomUUID(), email: "tx-rb@example.com" })
      .returning();
    const sentinel = "tx-rollback-probe";

    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(patients)
          .values({ caregiverId: caregiver!.id, displayName: sentinel });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    const rows = await db.select().from(patients);
    expect(
      rows.find((p) => p.displayName === sentinel),
      "If this fails, pg-mem now rolls back INSERTs — see docs/gotchas.md " +
        "and graduate the guard-ordered transfer tests to true atomicity " +
        "tests using mid-tx failure injection.",
    ).toBeDefined();
  });
});

describe("performTransfer — pre-transaction validations", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("rejects amount === 0 before opening the transaction", async () => {
    const seed = await seedPatientWithTwoAccounts(db);
    await expect(
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: seed.savingsId,
        amountCents: 0,
      }),
    ).rejects.toThrow("Amount must be greater than zero.");
  });

  it("rejects negative amount before opening the transaction", async () => {
    const seed = await seedPatientWithTwoAccounts(db);
    await expect(
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: seed.savingsId,
        amountCents: -100,
      }),
    ).rejects.toThrow("Amount must be greater than zero.");
  });

  it("rejects from === to before opening the transaction", async () => {
    const seed = await seedPatientWithTwoAccounts(db);
    await expect(
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: seed.checkingId,
        amountCents: 10_000,
      }),
    ).rejects.toThrow("From and to accounts must differ.");
  });
});

describe("performTransfer — atomic mutation", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("posts both legs sharing a transferId and updates both balances", async () => {
    const seed = await seedPatientWithTwoAccounts(db);
    const result = await performTransfer(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      fromAccountId: seed.checkingId,
      toAccountId: seed.savingsId,
      amountCents: 30_000,
    });

    expect(result.transferId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.fromTransactionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.toTransactionId).toMatch(/^[0-9a-f-]{36}$/);

    const txs = await db.select().from(transactions);
    expect(txs).toHaveLength(2);
    const fromLeg = txs.find((t) => t.accountId === seed.checkingId)!;
    const toLeg = txs.find((t) => t.accountId === seed.savingsId)!;
    expect(fromLeg.amountCents).toBe(-30_000);
    expect(fromLeg.kind).toBe("withdrawal");
    expect(fromLeg.label).toBe("To Savings");
    expect(fromLeg.transferId).toBe(result.transferId);
    expect(toLeg.amountCents).toBe(30_000);
    expect(toLeg.kind).toBe("deposit");
    expect(toLeg.label).toBe("From Checking");
    expect(toLeg.transferId).toBe(result.transferId);

    const accs = await db.select().from(accounts);
    const checking = accs.find((a) => a.id === seed.checkingId)!;
    const savings = accs.find((a) => a.id === seed.savingsId)!;
    expect(checking.balanceCents).toBe(70_000);
    expect(savings.balanceCents).toBe(55_000);
  });

  it("writes one audit_log row with both transaction ids in the after payload", async () => {
    const seed = await seedPatientWithTwoAccounts(db);
    const result = await performTransfer(db, {
      caregiverId: seed.caregiverId,
      patientId: seed.patientId,
      fromAccountId: seed.checkingId,
      toAccountId: seed.savingsId,
      amountCents: 30_000,
    });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    const entry = rows[0]!;
    expect(entry.actionKind).toBe("transfer_made");
    expect(entry.targetKind).toBe("account");
    expect(entry.targetId).toBe(seed.checkingId);
    expect(entry.caregiverId).toBe(seed.caregiverId);
    expect(entry.patientId).toBe(seed.patientId);
    expect(entry.after).toEqual({
      transferId: result.transferId,
      fromAccountId: seed.checkingId,
      toAccountId: seed.savingsId,
      amountCents: 30_000,
      transactionIds: [result.fromTransactionId, result.toTransactionId],
    });
  });

  // The next two tests verify the GUARD-ORDER invariant: validation
  // throws happen BEFORE any insert, so no rows are written when input
  // is bad. They satisfy the spec's "no partial state on failure"
  // criterion via the "no state changed because no mutation ran" path.
  // (pg-mem's ROLLBACK is a no-op for inserted rows, so true mid-tx
  // rollback can't be verified on this backend — see docs/gotchas.md.)
  it("rolls back when the destination account belongs to a different patient", async () => {
    const a = await seedPatientWithTwoAccounts(db);
    const b = await seedPatientWithTwoAccounts(db);

    await expect(
      performTransfer(db, {
        caregiverId: a.caregiverId,
        patientId: a.patientId,
        fromAccountId: a.checkingId,
        toAccountId: b.savingsId,
        amountCents: 10_000,
      }),
    ).rejects.toThrow("Accounts must belong to this patient.");

    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
    const accs = await db.select().from(accounts);
    expect(accs.find((x) => x.id === a.checkingId)!.balanceCents).toBe(
      100_000,
    );
    expect(accs.find((x) => x.id === b.savingsId)!.balanceCents).toBe(25_000);
  });

  it("rolls back when one of the accounts does not exist", async () => {
    const seed = await seedPatientWithTwoAccounts(db);

    await expect(
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: crypto.randomUUID(),
        amountCents: 10_000,
      }),
    ).rejects.toThrow("One or both accounts not found.");

    expect(await db.select().from(transactions)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("preserves balances under concurrent transfers from the same source", async () => {
    const seed = await seedPatientWithTwoAccounts(db);

    await Promise.all([
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: seed.savingsId,
        amountCents: 30_000,
      }),
      performTransfer(db, {
        caregiverId: seed.caregiverId,
        patientId: seed.patientId,
        fromAccountId: seed.checkingId,
        toAccountId: seed.savingsId,
        amountCents: 20_000,
      }),
    ]);

    const accs = await db.select().from(accounts);
    const checking = accs.find((a) => a.id === seed.checkingId)!;
    const savings = accs.find((a) => a.id === seed.savingsId)!;
    expect(checking.balanceCents + savings.balanceCents).toBe(125_000);
    expect(checking.balanceCents).toBe(50_000);
    expect(savings.balanceCents).toBe(75_000);
  });
});

void eq; // keep import for any future query that needs it
