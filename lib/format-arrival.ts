// Patient-facing arrival phrasing for a future date. Returns a natural-language
// fragment ready to slot after "will arrive ":
//   - "today"
//   - "tomorrow"
//   - "in 3 days"
//   - "on Friday"
//   - "on Tuesday, March 11"
//
// Negative day offsets clamp to "today" — in normal flow
// `materializeScheduledDeposits` runs before this and advances `next_run_at`
// past today, but a transient ordering hiccup must never produce "in -1 days"
// patient-side.
export function formatArrival(
  nextRunAt: string,
  now: Date,
  locale: string,
): string {
  const today = startOfUtcDay(now);
  const next = new Date(`${nextRunAt}T00:00:00.000Z`);
  const daysAway = Math.max(
    0,
    Math.round((next.getTime() - today.getTime()) / 86_400_000),
  );

  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway < 7) return `in ${daysAway} days`;
  if (daysAway < 14) {
    const weekday = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(next);
    return `on ${weekday}`;
  }
  const long = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(next);
  return `on ${long}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
