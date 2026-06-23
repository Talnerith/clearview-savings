import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { caregivers, mfaRecoveryCodes } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import {
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  generateRecoveryCodes,
} from "./recovery-codes";

async function seedCaregiver(db: TestDb): Promise<string> {
  const [row] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "caregiver@example.com" })
    .returning();
  return row!.id;
}

describe("generateRecoveryCodes", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("returns 10 grouped plaintext codes and stores 10 hashed rows", async () => {
    const caregiverId = await seedCaregiver(db);
    const codes = await generateRecoveryCodes(db, caregiverId);

    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }

    const stored = await db
      .select()
      .from(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.caregiverId, caregiverId));
    expect(stored).toHaveLength(10);

    // No plaintext (or its normalized form) leaks into a stored hash.
    for (const row of stored) {
      expect(row.codeHash.startsWith("scrypt$")).toBe(true);
      expect(row.usedAt).toBeNull();
      for (const code of codes) {
        const normalized = code.replace(/-/g, "");
        expect(row.codeHash).not.toContain(code);
        expect(row.codeHash).not.toContain(normalized);
      }
    }
  });
});

describe("consumeRecoveryCode", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("accepts a valid code once, then rejects reuse (single-use)", async () => {
    const caregiverId = await seedCaregiver(db);
    const [code] = await generateRecoveryCodes(db, caregiverId);

    expect(await consumeRecoveryCode(db, caregiverId, code!)).toBe(true);
    expect(await consumeRecoveryCode(db, caregiverId, code!)).toBe(false);
    expect(await countUnusedRecoveryCodes(db, caregiverId)).toBe(9);
  });

  it("rejects a garbage code and consumes nothing", async () => {
    const caregiverId = await seedCaregiver(db);
    await generateRecoveryCodes(db, caregiverId);

    expect(await consumeRecoveryCode(db, caregiverId, "ZZZZZ-ZZZZZ")).toBe(false);
    expect(await consumeRecoveryCode(db, caregiverId, "")).toBe(false);
    expect(await countUnusedRecoveryCodes(db, caregiverId)).toBe(10);
  });

  it("accepts a code regardless of case, spaces, or dashes", async () => {
    const caregiverId = await seedCaregiver(db);
    const codes = await generateRecoveryCodes(db, caregiverId);

    // dashless lowercase
    const a = codes[0]!.replace("-", "").toLowerCase();
    expect(await consumeRecoveryCode(db, caregiverId, a)).toBe(true);

    // spaced, mixed case
    const raw = codes[1]!.replace("-", "");
    const spaced = `  ${raw.slice(0, 5).toLowerCase()} ${raw.slice(5)}  `;
    expect(await consumeRecoveryCode(db, caregiverId, spaced)).toBe(true);
  });

  it("does not accept another caregiver's code", async () => {
    const a = await seedCaregiver(db);
    const b = await seedCaregiver(db);
    const [aCode] = await generateRecoveryCodes(db, a);
    await generateRecoveryCodes(db, b);

    expect(await consumeRecoveryCode(db, b, aCode!)).toBe(false);
    // a's code is still unused.
    expect(await countUnusedRecoveryCodes(db, a)).toBe(10);
  });
});

describe("regeneration", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("invalidates the prior set", async () => {
    const caregiverId = await seedCaregiver(db);
    const oldCodes = await generateRecoveryCodes(db, caregiverId);

    const newCodes = await generateRecoveryCodes(db, caregiverId);

    // Old codes no longer verify; the new set replaced them entirely.
    expect(await consumeRecoveryCode(db, caregiverId, oldCodes[0]!)).toBe(false);
    expect(await countUnusedRecoveryCodes(db, caregiverId)).toBe(10);
    expect(await consumeRecoveryCode(db, caregiverId, newCodes[0]!)).toBe(true);
  });
});
