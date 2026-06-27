import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import { accounts, transactions, type Transaction } from "@/lib/db/schema";
import { dollarsString, dollarsToCents } from "@/lib/money";

// Shared core of the caregiver "manual transaction" feature. Extracted from the
// web Server Action (app/(caregiver)/.../actions.ts manualAdjustmentAction) so
// the mobile API endpoint runs the exact same balance-affecting logic — one
// source of truth, no duplicated money math (CLAUDE.md: don't re-implement
// balance logic in two places).

const uuid = z.string().uuid();

export const adjustmentKindSchema = z.enum([
  "deposit",
  "withdrawal",
  "fee",
  "adjustment",
]);

// The object schema both callers validate against. The web action feeds it
// FormData fields; the endpoint feeds it a JSON body. `amount` stays a dollars
// string so the single validated shape serves both surfaces.
export const manualAdjustmentInput = z
  .object({
    patientId: uuid,
    accountId: uuid,
    kind: adjustmentKindSchema,
    amount: dollarsString,
    label: z.string().trim().min(1, "Description is required.").max(80),
    direction: z.enum(["increase", "decrease"]).optional(),
  })
  .refine((v) => v.kind !== "adjustment" || v.direction !== undefined, {
    message: "Choose increase or decrease.",
    path: ["direction"],
  });

export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentInput>;

export type ApplyManualAdjustmentArgs = ManualAdjustmentInput & {
  caregiverId: string;
};

// Posts one signed manual transaction, updates the account balance, and writes
// the audit row — all inside a single db.transaction so a partial write never
// lands. Ownership of the account by the patient is re-checked inside the
// transaction (never trust a client-supplied accountId). Caller is responsible
// for asserting the caregiver owns `patientId` first.
export async function applyManualAdjustment(
  db: AppDatabase,
  args: ApplyManualAdjustmentArgs,
): Promise<Transaction> {
  const cents = dollarsToCents(args.amount);

  // Sign convention: amountCents on a transaction is the signed delta to the
  // account balance. balance always tracks the running sum.
  let signedCents: number;
  switch (args.kind) {
    case "deposit":
      signedCents = cents;
      break;
    case "withdrawal":
    case "fee":
      signedCents = -cents;
      break;
    case "adjustment":
      signedCents = args.direction === "decrease" ? -cents : cents;
      break;
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, args.accountId),
          eq(accounts.patientId, args.patientId),
        ),
      )
      .limit(1);
    if (!owned[0]) {
      throw new Error("Account does not belong to this patient.");
    }

    const [inserted] = await tx
      .insert(transactions)
      .values({
        accountId: args.accountId,
        kind: args.kind,
        amountCents: signedCents,
        label: args.label,
        postedAt: new Date(),
        source: "manual",
      })
      .returning();
    if (!inserted) {
      throw new Error("Failed to insert manual transaction");
    }

    await tx
      .update(accounts)
      .set({ balanceCents: sql`${accounts.balanceCents} + ${signedCents}` })
      .where(eq(accounts.id, args.accountId));

    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: args.patientId,
      actionKind: "transaction_created",
      targetKind: "transaction",
      targetId: inserted.id,
      after: inserted,
    });

    return inserted;
  });
}
