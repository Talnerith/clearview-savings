import { z } from "zod";

// Shared money helpers. Money is always integer cents (CLAUDE.md); dollars are
// a display/input edge format only. These were duplicated verbatim across the
// caregiver transaction + transfer actions; centralized here so the mobile API
// endpoints validate identically (no drift between the two callers).

export const dollarsString = z
  .string()
  .trim()
  .min(1, "Amount is required.")
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount like 1234.56.");

// Accepts "12", "12.3", or "12.34" — already shape-validated by dollarsString.
export function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}
