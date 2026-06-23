import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { patients, type Patient } from "@/lib/db/schema";

export type PatientBrand = {
  name: string;
};

const DEFAULT_BRAND: PatientBrand = { name: "Clearview Savings" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns the bank brand presented to the patient. Always "Clearview
// Savings" per ADR 0002 (per-patient brand override cancelled on legal
// grounds — Canadian Bank Act Section 983 + trademark / passing-off
// exposure). The indirection survives because it costs nothing and gives
// us a clean swap point if a future legitimate use case (e.g., a
// memory-care-facility white label under their own brand) reactivates it
// — but there is no current swap target and patient code should reason
// about this as if it returned a constant.
export function getPatientBrand(
  patient: Patient | null | undefined = null,
): PatientBrand {
  void patient;
  return DEFAULT_BRAND;
}

// Async variant resolving the brand by patient id. Used by `generateMetadata`
// in patient routes so the browser-tab `<title>` reads through the same
// branding source as the in-page header. Unknown or malformed ids fall back
// to the default brand — the title still reads like a real bank, never like
// an error state, per CLAUDE.md patient UX rules.
//
// This pulls in `db` (server-only). The file is safe to import from server
// components only; client imports would fail at Next.js bundle time.
export async function getPatientBrandById(
  id: string | undefined,
): Promise<PatientBrand> {
  if (!id || !UUID_RE.test(id)) return getPatientBrand(null);
  try {
    const rows = await db
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .limit(1);
    return getPatientBrand(rows[0] ?? null);
  } catch {
    // DB unreachable from generateMetadata must never throw — that produces a
    // patient-visible error UI. Fall back to the default brand so the tab
    // title still reads like a real bank.
    return getPatientBrand(null);
  }
}
