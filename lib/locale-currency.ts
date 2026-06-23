// Currency is never configured or displayed anywhere in the product: a bank
// shows amounts in the currency of the country it operates in (M9 round-2
// review — the visible Currency setting only confused things). The region
// half of the patient's locale decides the currency; the result is stored in
// settings.currency on save so every existing formatter keeps working
// unchanged.
const REGION_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  // Eurozone
  AT: "EUR",
  BE: "EUR",
  DE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  IE: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",
};

export function currencyForLocale(locale: string): string {
  const region = locale.split("-")[1]?.toUpperCase() ?? "";
  return REGION_CURRENCY[region] ?? "USD";
}
