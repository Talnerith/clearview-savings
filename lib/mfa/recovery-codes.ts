import {
  randomInt,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";
import { mfaRecoveryCodes } from "@/lib/db/schema";

// Dependency-injected db handle — same pattern as lib/deposit-codes.ts, so
// pg-mem-backed tests pass an in-memory db without mocking. Callers in the
// app pass the global `db` from lib/db.
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Unambiguous alphabet (no 0/O, 1/I/L) — same set lib/deposit-codes.ts uses.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// 10 chars, displayed grouped "ABCDE-FGHIJ". ~50 bits of entropy per code.
const CODE_CHARS = 10;
const RECOVERY_CODE_COUNT = 10;
const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;

function generatePlainCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_CHARS; i++) {
    // randomInt(min, max) is unbiased over [min, max).
    raw += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

// Strip the display grouping (dashes/spaces) and case before hashing or
// comparing, so a caregiver can type the code however the UI presents it.
function normalize(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Per-code random salt, stored inline: "scrypt$<saltHex>$<hashHex>". The
// plaintext code is never persisted.
function hashCode(normalized: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(normalized, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyCode(normalized: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(normalized, salt, expected.length);
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}

// Issue a fresh set of one-time recovery codes for a caregiver, returning the
// plaintext for a single display. Deletes any existing set first, so
// regenerating immediately invalidates the prior codes (M7 spec acceptance
// criterion). Only the salted hashes are stored.
export async function generateRecoveryCodes(
  db: AppDatabase,
  caregiverId: string,
): Promise<string[]> {
  await db
    .delete(mfaRecoveryCodes)
    .where(eq(mfaRecoveryCodes.caregiverId, caregiverId));

  const plain: string[] = [];
  const rows: { caregiverId: string; codeHash: string }[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generatePlainCode();
    plain.push(code);
    rows.push({ caregiverId, codeHash: hashCode(normalize(code)) });
  }
  await db.insert(mfaRecoveryCodes).values(rows);
  return plain;
}

// Consume a single recovery code. Returns true exactly once per valid code:
// the matching row's used_at is stamped under a `where used_at is null`
// guard, so a concurrent second consume of the same code returns false.
// Scoped by caregiverId — never trusts a client-supplied owner.
export async function consumeRecoveryCode(
  db: AppDatabase,
  caregiverId: string,
  submitted: string,
): Promise<boolean> {
  const normalized = normalize(submitted);
  if (normalized.length === 0) return false;

  // Each row carries its own salt, so we can't index by hash — scan the
  // caregiver's unused codes (N <= 10) and timing-safe compare each.
  const rows = await db
    .select()
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.caregiverId, caregiverId),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    );

  for (const row of rows) {
    if (!verifyCode(normalized, row.codeHash)) continue;
    const claimed = await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.id, row.id),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id });
    return claimed.length > 0;
  }
  return false;
}

// How many unused codes remain — for the settings page "N codes remaining"
// display.
export async function countUnusedRecoveryCodes(
  db: AppDatabase,
  caregiverId: string,
): Promise<number> {
  const rows = await db
    .select({ id: mfaRecoveryCodes.id })
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.caregiverId, caregiverId),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    );
  return rows.length;
}
