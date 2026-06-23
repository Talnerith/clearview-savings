import { and, asc, eq } from "drizzle-orm";

import type { AppDatabase } from "@/lib/audit-log";
import { accounts, scheduledDeposits } from "@/lib/db/schema";

export type PendingDepositItem = {
  scheduledDepositId: string;
  label: string;
  amountCents: number;
  nextRunAt: string;
  accountId: string;
  accountName: string;
};

// Returns active scheduled deposits whose next occurrence falls within their
// own caregiver-set pending window. Per-row threshold (each scheduled deposit
// carries its own `pending_days`, 0..14, default 5) — not a global cutoff.
//
// Filtering happens in JS rather than SQL because the per-patient set of
// scheduled deposits is small (typically 1–3) and the SQL would require an
// interval expression mixing a date column with an integer column. JS keeps
// the query simple and the date arithmetic explicit.
export async function getPendingDeposits(
  db: AppDatabase,
  patientId: string,
  now: Date,
): Promise<PendingDepositItem[]> {
  const rows = await db
    .select({
      scheduledDepositId: scheduledDeposits.id,
      label: scheduledDeposits.label,
      amountCents: scheduledDeposits.amountCents,
      nextRunAt: scheduledDeposits.nextRunAt,
      pendingDays: scheduledDeposits.pendingDays,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(scheduledDeposits)
    .innerJoin(accounts, eq(accounts.id, scheduledDeposits.accountId))
    .where(
      and(
        eq(accounts.patientId, patientId),
        eq(scheduledDeposits.active, true),
      ),
    )
    .orderBy(asc(scheduledDeposits.nextRunAt));

  const todayMs = startOfUtcDay(now).getTime();
  const items: PendingDepositItem[] = [];
  for (const r of rows) {
    const nextMs = new Date(`${r.nextRunAt}T00:00:00.000Z`).getTime();
    const daysAway = Math.round((nextMs - todayMs) / 86_400_000);
    if (daysAway < 0) continue;
    if (daysAway > r.pendingDays) continue;
    items.push({
      scheduledDepositId: r.scheduledDepositId,
      label: r.label,
      amountCents: r.amountCents,
      nextRunAt: r.nextRunAt,
      accountId: r.accountId,
      accountName: r.accountName,
    });
  }
  return items;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
