import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";
import {
  accounts,
  scheduledDeposits,
  transactions,
  type ScheduledDeposit,
} from "@/lib/db/schema";

// AppDatabase accepts any drizzle pg driver (postgres-js in production,
// pg-proxy in tests). The HKT differs per driver but every operation we use
// lives on the PgDatabase base class.
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export type MaterializeOptions = {
  now?: Date;
};

// Walks every active scheduled deposit for a patient and creates transaction
// rows for any occurrence whose date is <= today. Idempotent: re-running with
// the same `now` produces no duplicate transactions because the
// transactions_scheduled_occurrence_uniq partial index rejects collisions and
// account balances are advanced only by rows that were actually inserted.
export async function materializeScheduledDeposits(
  db: AppDatabase,
  patientId: string,
  options: MaterializeOptions = {},
): Promise<void> {
  const today = toDateString(options.now ?? new Date());

  const active = await db
    .select({
      id: scheduledDeposits.id,
      accountId: scheduledDeposits.accountId,
      label: scheduledDeposits.label,
      amountCents: scheduledDeposits.amountCents,
      frequency: scheduledDeposits.frequency,
      nextRunAt: scheduledDeposits.nextRunAt,
    })
    .from(scheduledDeposits)
    .innerJoin(accounts, eq(accounts.id, scheduledDeposits.accountId))
    .where(
      and(eq(accounts.patientId, patientId), eq(scheduledDeposits.active, true)),
    );

  for (const deposit of active) {
    const occurrences: string[] = [];
    let cursor = deposit.nextRunAt;
    while (cursor <= today) {
      occurrences.push(cursor);
      cursor = nextOccurrenceDate(cursor, deposit.frequency);
    }
    if (occurrences.length === 0) continue;

    const inserted = await db
      .insert(transactions)
      .values(
        occurrences.map((occurrence) => ({
          accountId: deposit.accountId,
          kind: "deposit" as const,
          amountCents: deposit.amountCents,
          label: deposit.label,
          postedAt: new Date(`${occurrence}T00:00:00.000Z`),
          source: "scheduled" as const,
          scheduledDepositId: deposit.id,
          scheduledOccurrenceDate: occurrence,
        })),
      )
      .onConflictDoNothing({
        target: [
          transactions.scheduledDepositId,
          transactions.scheduledOccurrenceDate,
        ],
        where: sql`${transactions.scheduledDepositId} is not null`,
      })
      .returning({ amountCents: transactions.amountCents });

    if (inserted.length > 0) {
      const totalAdded = inserted.reduce(
        (sum, row) => sum + row.amountCents,
        0,
      );
      await db
        .update(accounts)
        .set({ balanceCents: sql`${accounts.balanceCents} + ${totalAdded}` })
        .where(eq(accounts.id, deposit.accountId));
    }

    await db
      .update(scheduledDeposits)
      .set({ nextRunAt: cursor })
      .where(eq(scheduledDeposits.id, deposit.id));
  }
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextOccurrenceDate(
  date: string,
  frequency: ScheduledDeposit["frequency"],
): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (frequency === "biweekly") {
    d.setUTCDate(d.getUTCDate() + 14);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}
