import { randomInt } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";
import {
  accounts,
  depositCodes,
  transactions,
} from "@/lib/db/schema";

export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Alphabet excludes ambiguous glyphs: 0/O, 1/I/L. 31 characters.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt(min, max) is unbiased over [min, max).
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

export type RedeemResult =
  | {
      ok: true;
      transactionId: string;
      accountId: string;
      amountCents: number;
      label: string;
    }
  | { ok: false; reason: "invalid_or_used" };

// Atomically redeem a deposit code.
//
// The single-use guarantee comes from the first UPDATE: WHERE status='unused'
// RETURNING. Postgres serializes concurrent updates of the same row, so
// exactly one caller's claim returns a row; any concurrent caller sees zero
// rows returned and we map that to { ok: false }.
//
// We deliberately do NOT wrap the whole sequence in db.transaction(): drizzle's
// pg-proxy backend (used by tests) does not support transactions, and the
// claim itself is the only step where atomicity matters for the race. The
// remaining steps (insert transaction, update balance, backfill code FK) run
// after the claim is locked in. If a connection drops mid-sequence, the
// failure surface is a code marked used with no transaction posted — a
// recoverable inconsistency a future caregiver-side reconciliation tool can
// detect by joining deposit_codes (status='used', transaction_id IS NULL)
// against transactions. Documented as a known small window in M2 docs.
//
// Multi-account routing is not supported in M2: the deposit always lands on
// the patient's first-created account. See M2 docs for the future seam.
export async function redeemCode(
  db: AppDatabase,
  args: { patientId: string; code: string },
): Promise<RedeemResult> {
  const claimed = await db
    .update(depositCodes)
    .set({ status: "used", usedAt: new Date() })
    .where(
      and(
        eq(depositCodes.code, args.code),
        eq(depositCodes.patientId, args.patientId),
        eq(depositCodes.status, "unused"),
      ),
    )
    .returning({
      id: depositCodes.id,
      amountCents: depositCodes.amountCents,
      label: depositCodes.label,
      targetAccountId: depositCodes.targetAccountId,
    });

  const code = claimed[0];
  if (!code) {
    return { ok: false, reason: "invalid_or_used" };
  }

  // M4: honor target_account_id if the caregiver pre-assigned the deposit's
  // destination at code generation time. Fall back to the first-by-created_at
  // account when null (preserves M2/M3 semantics for any pre-M4 rows). The
  // fallback path also runs if the targeted account was deleted between
  // generation and redemption (FK is set null on delete).
  let account: { id: string } | undefined;
  if (code.targetAccountId) {
    const targeted = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, code.targetAccountId),
          eq(accounts.patientId, args.patientId),
        ),
      )
      .limit(1);
    account = targeted[0];
  }
  if (!account) {
    const fallback = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.patientId, args.patientId))
      .orderBy(asc(accounts.createdAt))
      .limit(1);
    account = fallback[0];
  }
  if (!account) {
    throw new Error(
      `Patient ${args.patientId} has no accounts to deposit into`,
    );
  }

  const insertedTx = await db
    .insert(transactions)
    .values({
      accountId: account.id,
      kind: "deposit",
      amountCents: code.amountCents,
      label: code.label,
      postedAt: new Date(),
      source: "code",
    })
    .returning({ id: transactions.id });
  const transaction = insertedTx[0];
  if (!transaction) {
    throw new Error("Failed to insert deposit transaction");
  }

  await db
    .update(accounts)
    .set({
      balanceCents: sql`${accounts.balanceCents} + ${code.amountCents}`,
    })
    .where(eq(accounts.id, account.id));

  await db
    .update(depositCodes)
    .set({ transactionId: transaction.id })
    .where(eq(depositCodes.id, code.id));

  return {
    ok: true,
    transactionId: transaction.id,
    accountId: account.id,
    amountCents: code.amountCents,
    label: code.label,
  };
}
