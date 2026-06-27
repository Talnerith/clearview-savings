import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import {
  accounts,
  transactions,
  type Account,
  type Transaction,
} from "@/lib/db/schema";
import { dollarsToCents } from "@/lib/money";

// Shared core of the caregiver account actions (add savings, rename), extracted
// from the web Server Actions so the mobile API endpoints behave identically.
// Callers must first assert the caregiver owns `patientId`.

const uuid = z.string().uuid();

export const addAccountInput = z.object({
  patientId: uuid,
  name: z
    .string()
    .trim()
    .min(1, "Account name is required.")
    .max(40)
    .default("Savings"),
  // Empty string and "0" both mean "no opening transaction".
  startingBalance: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "0"))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
      message: "Enter a positive amount like 500.00.",
    }),
});

export type AddAccountInput = z.infer<typeof addAccountInput>;

// Creates the patient's (single) savings account. Throws if one already exists.
export async function addAccount(
  db: AppDatabase,
  args: { caregiverId: string } & AddAccountInput,
): Promise<Account> {
  const existingSavings = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.patientId, args.patientId), eq(accounts.type, "savings")),
    )
    .limit(1);
  if (existingSavings[0]) {
    throw new Error("A savings account already exists.");
  }

  const openingCents = dollarsToCents(args.startingBalance);

  return db.transaction(async (tx) => {
    const [createdAccount] = await tx
      .insert(accounts)
      .values({ patientId: args.patientId, name: args.name, type: "savings" })
      .returning();
    if (!createdAccount) {
      throw new Error("Failed to create account");
    }

    let createdOpeningTx: Transaction | undefined;
    if (openingCents > 0) {
      const [openingRow] = await tx
        .insert(transactions)
        .values({
          accountId: createdAccount.id,
          kind: "adjustment",
          amountCents: openingCents,
          label: "Opening balance",
          postedAt: new Date(),
          source: "manual",
        })
        .returning();
      if (!openingRow) {
        throw new Error("Failed to post opening balance");
      }
      createdOpeningTx = openingRow;

      await tx
        .update(accounts)
        .set({ balanceCents: openingCents })
        .where(eq(accounts.id, createdAccount.id));
    }

    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: args.patientId,
      actionKind: "account_created",
      targetKind: "account",
      targetId: createdAccount.id,
      after: {
        account: createdAccount,
        openingTransactionId: createdOpeningTx?.id ?? null,
        openingAmountCents: openingCents,
      },
      note: openingCents > 0 ? "Opened with starting balance" : null,
    });

    // `createdAccount` is the pre-update snapshot (balanceCents 0); return it
    // with the balance the opening transaction set, so callers (and the mobile
    // endpoint response) report the right figure.
    return { ...createdAccount, balanceCents: openingCents };
  });
}

export const renameAccountInput = z.object({
  patientId: uuid,
  accountId: uuid,
  name: z.string().trim().min(1, "Account name is required.").max(40),
});

export type RenameAccountInput = z.infer<typeof renameAccountInput>;

// Renames an account the patient owns. Returns the updated row, or null for a
// no-op (same name) — callers treat null as success without an audit row.
export async function renameAccount(
  db: AppDatabase,
  args: { caregiverId: string } & RenameAccountInput,
): Promise<Account | null> {
  const [before] = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.id, args.accountId), eq(accounts.patientId, args.patientId)),
    )
    .limit(1);
  if (!before) {
    throw new Error("Account does not belong to this patient.");
  }
  if (before.name === args.name) {
    return null;
  }

  const [updated] = await db
    .update(accounts)
    .set({ name: args.name })
    .where(eq(accounts.id, args.accountId))
    .returning();
  if (!updated) {
    throw new Error("Failed to rename account");
  }

  await logCaregiverAction(db, {
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind: "account_renamed",
    targetKind: "account",
    targetId: updated.id,
    before: { name: before.name },
    after: { name: updated.name },
  });

  return updated;
}
