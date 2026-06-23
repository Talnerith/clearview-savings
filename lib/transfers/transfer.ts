import { eq, inArray, sql } from "drizzle-orm";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import { accounts, transactions } from "@/lib/db/schema";

export type PerformTransferArgs = {
  caregiverId: string;
  patientId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
};

export type PerformTransferResult = {
  transferId: string;
  fromTransactionId: string;
  toTransactionId: string;
};

// Atomic intra-patient transfer between two of the patient's accounts.
// Wraps the two transaction inserts, the two balance updates, and the
// audit log insert in a single `db.transaction()`. Throws on any
// invariant violation; the throw rolls back the transaction so partial
// state never lands.
//
// The same-patient guard re-fetches both accounts inside the transaction
// rather than relying on a pre-validated arg. This closes the window
// where a caller might compose stale ownership info; ownership is checked
// against the rows that will actually be mutated.
export async function performTransfer(
  db: AppDatabase,
  args: PerformTransferArgs,
): Promise<PerformTransferResult> {
  if (args.amountCents <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  if (args.fromAccountId === args.toAccountId) {
    throw new Error("From and to accounts must differ.");
  }

  return db.transaction(async (tx) => {
    const candidateAccounts = await tx
      .select({
        id: accounts.id,
        name: accounts.name,
        patientId: accounts.patientId,
      })
      .from(accounts)
      .where(inArray(accounts.id, [args.fromAccountId, args.toAccountId]));
    if (candidateAccounts.length !== 2) {
      throw new Error("One or both accounts not found.");
    }
    if (candidateAccounts.some((a) => a.patientId !== args.patientId)) {
      throw new Error("Accounts must belong to this patient.");
    }
    const fromAcct = candidateAccounts.find(
      (a) => a.id === args.fromAccountId,
    )!;
    const toAcct = candidateAccounts.find(
      (a) => a.id === args.toAccountId,
    )!;

    const transferId = crypto.randomUUID();
    const now = new Date();

    const [fromTx] = await tx
      .insert(transactions)
      .values({
        accountId: fromAcct.id,
        kind: "withdrawal",
        amountCents: -args.amountCents,
        label: `To ${toAcct.name}`,
        postedAt: now,
        source: "manual",
        transferId,
      })
      .returning();
    if (!fromTx) throw new Error("Failed to insert from-leg transaction.");

    const [toTx] = await tx
      .insert(transactions)
      .values({
        accountId: toAcct.id,
        kind: "deposit",
        amountCents: args.amountCents,
        label: `From ${fromAcct.name}`,
        postedAt: now,
        source: "manual",
        transferId,
      })
      .returning();
    if (!toTx) throw new Error("Failed to insert to-leg transaction.");

    // Both legs use ADDITION with a signed amount rather than mixing + and
    // -. Production (Postgres) evaluates both forms identically, but
    // pg-mem (the test backend) has a bug where `column - $param`
    // mis-evaluates to `-(column - param)` — see docs/gotchas.md. Using
    // `+ negative` sidesteps the broken pg-mem code path and keeps the
    // test suite trustworthy. Zero behavioral difference in production.
    await tx
      .update(accounts)
      .set({
        balanceCents: sql`${accounts.balanceCents} + ${-args.amountCents}`,
      })
      .where(eq(accounts.id, fromAcct.id));
    await tx
      .update(accounts)
      .set({
        balanceCents: sql`${accounts.balanceCents} + ${args.amountCents}`,
      })
      .where(eq(accounts.id, toAcct.id));

    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: args.patientId,
      actionKind: "transfer_made",
      targetKind: "account",
      targetId: fromAcct.id,
      after: {
        transferId,
        fromAccountId: fromAcct.id,
        toAccountId: toAcct.id,
        amountCents: args.amountCents,
        transactionIds: [fromTx.id, toTx.id],
      },
    });

    return {
      transferId,
      fromTransactionId: fromTx.id,
      toTransactionId: toTx.id,
    };
  });
}
