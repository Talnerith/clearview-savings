// Per-row running balances for the patient transaction table (M9).
//
// Balances are derived BACKWARDS from the account's authoritative current
// `balance_cents`: the newest row shows the current balance, and each older
// row subtracts the amounts of everything newer. Deriving from the current
// balance (rather than summing forward from zero) means the newest row
// always reconciles with the balance the hero band shows, even when older
// rows are cut off by the page's query limit.

export type RunningBalanceRow = {
  id: string;
  amountCents: number;
  postedAt: Date | string;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function postedAtMs(value: Date | string): number {
  if (typeof value !== "string") return value.getTime();
  // Date-only strings get an explicit UTC midnight, matching how
  // patient-format.ts parses them for display.
  return new Date(
    DATE_ONLY_RE.test(value) ? `${value}T00:00:00Z` : value,
  ).getTime();
}

// Returns the rows newest-first with `runningBalanceCents` attached. Input
// order doesn't matter: rows are re-sorted on (postedAt desc, id desc) so
// same-timestamp rows get a deterministic order — and therefore deterministic
// balances — regardless of how the database happened to return them.
export function withRunningBalances<T extends RunningBalanceRow>(
  rows: readonly T[],
  currentBalanceCents: number,
): (T & { runningBalanceCents: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const byTime = postedAtMs(b.postedAt) - postedAtMs(a.postedAt);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });

  let balance = currentBalanceCents;
  return sorted.map((row) => {
    const withBalance = { ...row, runningBalanceCents: balance };
    balance -= row.amountCents;
    return withBalance;
  });
}
