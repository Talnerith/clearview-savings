// Shared formatting helpers for patient-facing pages. Previously each page
// carried its own copy; the M9 restyle centralizes them so sizes and formats
// can't drift between screens.

export type PatientSettings = {
  font_size: string;
  locale: string;
  currency: string;
};

export function readSettings(raw: unknown): PatientSettings {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PatientSettings>;
    return {
      font_size: typeof r.font_size === "string" ? r.font_size : "lg",
      locale: typeof r.locale === "string" ? r.locale : "en-US",
      currency: typeof r.currency === "string" ? r.currency : "USD",
    };
  }
  return { font_size: "lg", locale: "en-US", currency: "USD" };
}

// narrowSymbol: always "$1,234.56", never "US$1,234.56" — a bank shows
// amounts in its own country's currency with no qualifier (M9 round 2).
export function formatMoney(cents: number, s: PatientSettings): string {
  return new Intl.NumberFormat(s.locale, {
    style: "currency",
    currency: s.currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

// "Tuesday, March 11" — the patient-UX date format (CLAUDE.md).
export function formatDateLong(
  date: Date | string,
  s: PatientSettings,
): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date;
  return new Intl.DateTimeFormat(s.locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}
