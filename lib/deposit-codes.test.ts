import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  caregivers,
  depositCodes,
  patients,
  transactions,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { generateCode, redeemCode } from "./deposit-codes";

async function seed(db: TestDb) {
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
      balanceCents: 100_000,
    })
    .returning();

  return {
    patientId: patient!.id,
    accountId: account!.id,
  };
}

async function insertCode(
  db: TestDb,
  patientId: string,
  overrides: Partial<{ code: string; amountCents: number; label: string }> = {},
) {
  const [row] = await db
    .insert(depositCodes)
    .values({
      patientId,
      code: overrides.code ?? generateCode(),
      amountCents: overrides.amountCents ?? 5_000,
      kind: "check",
      label: overrides.label ?? "Birthday from Aunt Susan",
    })
    .returning();
  return row!;
}

async function insertWorkbookCode(
  db: TestDb,
  patientId: string,
  overrides: Partial<{ code: string; amountCents: number; label: string }> = {},
) {
  const [row] = await db
    .insert(depositCodes)
    .values({
      patientId,
      code: overrides.code ?? generateCode(),
      amountCents: overrides.amountCents ?? 1_500,
      kind: "workbook",
      label: overrides.label ?? "Activity Set #1",
      workbookKind: "mixed",
      workbookGrade: 2,
      // Race test doesn't read this column; minimal placeholder is enough.
      contentSeed: { seed: "test-seed", kind: "mixed", grade: 2, pages: [] },
    })
    .returning();
  return row!;
}

describe("generateCode", () => {
  const ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

  it("produces 8-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 5_000; i++) {
      const code = generateCode();
      expect(code).toMatch(ALPHABET);
    }
  });

  it("never emits ambiguous glyphs (0, O, 1, I, L)", () => {
    for (let i = 0; i < 5_000; i++) {
      const code = generateCode();
      expect(code).not.toMatch(/[0OIL1]/);
    }
  });
});

describe("redeemCode", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("posts a deposit, marks the code used, and returns the truth", async () => {
    const { patientId, accountId } = await seed(db);
    const code = await insertCode(db, patientId, {
      amountCents: 5_000,
      label: "Birthday from Aunt Susan",
    });

    const result = await redeemCode(db, {
      patientId,
      code: code.code,
    });

    expect(result).toEqual({
      ok: true,
      transactionId: expect.any(String),
      accountId,
      amountCents: 5_000,
      label: "Birthday from Aunt Susan",
    });

    const [updatedCode] = await db
      .select()
      .from(depositCodes)
      .where(eq(depositCodes.id, code.id));
    expect(updatedCode!.status).toBe("used");
    expect(updatedCode!.usedAt).toBeTruthy();
    expect(updatedCode!.transactionId).toBe(
      result.ok ? result.transactionId : null,
    );

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amountCents).toBe(5_000);
    expect(txs[0]!.label).toBe("Birthday from Aunt Susan");
    expect(txs[0]!.source).toBe("code");

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(100_000 + 5_000);
  });

  it("rejects an unknown code with reason='invalid_or_used'", async () => {
    const { patientId } = await seed(db);
    const result = await redeemCode(db, {
      patientId,
      code: "XXXXXXXX",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_or_used" });
  });

  it("rejects a code that's already been used", async () => {
    const { patientId } = await seed(db);
    const code = await insertCode(db, patientId);

    const first = await redeemCode(db, { patientId, code: code.code });
    expect(first.ok).toBe(true);

    const second = await redeemCode(db, { patientId, code: code.code });
    expect(second).toEqual({ ok: false, reason: "invalid_or_used" });
  });

  it("rejects a code that belongs to a different patient", async () => {
    const a = await seed(db);
    const b = await seed(db);
    const code = await insertCode(db, a.patientId);

    const result = await redeemCode(db, {
      patientId: b.patientId,
      code: code.code,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_or_used" });

    // The code is still unused.
    const [row] = await db
      .select()
      .from(depositCodes)
      .where(eq(depositCodes.id, code.id));
    expect(row!.status).toBe("unused");
  });

  it("is single-use under concurrent redemption for kind='workbook'", async () => {
    const { patientId, accountId } = await seed(db);
    const code = await insertWorkbookCode(db, patientId, {
      amountCents: 1_500,
      label: "Activity Set #1",
    });

    const [a, b] = await Promise.all([
      redeemCode(db, { patientId, code: code.code }),
      redeemCode(db, { patientId, code: code.code }),
    ]);

    const successes = [a, b].filter((r) => r.ok);
    const failures = [a, b].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({ ok: false, reason: "invalid_or_used" });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amountCents).toBe(1_500);
    expect(txs[0]!.label).toBe("Activity Set #1");
    expect(txs[0]!.source).toBe("code");

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(100_000 + 1_500);
  });

  it("redeems an M8 workbook reward check end-to-end", async () => {
    // Since M8 (ADR 0004) the reward is minted as kind = "check" carrying
    // workbook content, deposited through the same flow as a plain check.
    const { patientId, accountId } = await seed(db);
    const [reward] = await db
      .insert(depositCodes)
      .values({
        patientId,
        code: generateCode(),
        amountCents: 1_500,
        kind: "check",
        label: "Activity Set #1",
        workbookKind: "mixed",
        workbookGrade: 0,
        contentSeed: { seed: "s", kind: "mixed", grade: 0, pages: [] },
      })
      .returning();

    const result = await redeemCode(db, { patientId, code: reward!.code });

    expect(result.ok).toBe(true);
    const [updated] = await db
      .select()
      .from(depositCodes)
      .where(eq(depositCodes.id, reward!.id));
    expect(updated!.status).toBe("used");

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amountCents).toBe(1_500);
    expect(txs[0]!.label).toBe("Activity Set #1");
  });

  it("is single-use under concurrent redemption", async () => {
    const { patientId, accountId } = await seed(db);
    const code = await insertCode(db, patientId, { amountCents: 7_500 });

    const [a, b] = await Promise.all([
      redeemCode(db, { patientId, code: code.code }),
      redeemCode(db, { patientId, code: code.code }),
    ]);

    const successes = [a, b].filter((r) => r.ok);
    const failures = [a, b].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({ ok: false, reason: "invalid_or_used" });

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amountCents).toBe(7_500);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(100_000 + 7_500);
  });

  // M2 spec: the patient-typed amount on the deposit wizard is theatre. The
  // posted transaction's amountCents must come from the deposit_codes row,
  // never from any sibling input. The redeemCode signature itself excludes a
  // typed amount; this test locks the resulting-transaction contract so a
  // future refactor can't quietly start trusting a caller-supplied number.
  it("ignores typed amount entirely — transaction matches the code, not any sibling input", async () => {
    const { patientId, accountId } = await seed(db);
    const code = await insertCode(db, patientId, {
      amountCents: 5_000,
      label: "Birthday from Aunt Susan",
    });

    // The "typed amount" the patient might have entered (e.g. they read the
    // numerals wrong). It is intentionally not part of the redeemCode
    // signature, so there is no way to pass it through. We bind it here purely
    // to make the test's intent legible and to assert the posted amount is
    // *not* equal to it below.
    const typedAmountCents = 99_999; // patient typed $999.99

    const result = await redeemCode(db, { patientId, code: code.code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountCents).toBe(5_000);

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amountCents).toBe(5_000);
    expect(txs[0]!.amountCents).not.toBe(typedAmountCents);
    expect(txs[0]!.label).toBe("Birthday from Aunt Susan");

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account!.balanceCents).toBe(100_000 + 5_000);
  });
});
