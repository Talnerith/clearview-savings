import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// One source of truth for "where does this session sit relative to MFA?",
// shared by middleware, the sign-in redirect, the challenge page, and the
// caregiver server loader so they can't drift apart.
//
//  - "no-factor"        — no verified factor; AAL1 is sufficient (the
//                         caregiver never opted in, or just unenrolled).
//  - "aal1-needs-aal2"  — a verified factor exists but the session is still
//                         AAL1; the dashboard must not be reachable yet.
//  - "aal2"             — stepped up; full access.
export type AalState = "no-factor" | "aal1-needs-aal2" | "aal2";

// Derived from supabase.auth.mfa.getAuthenticatorAssuranceLevel(), which is a
// local computation off the session JWT (no network round-trip), so it is
// cheap enough to call in middleware on every caregiver request.
export async function getAalState(
  supabase: SupabaseClient,
): Promise<AalState> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = data?.currentLevel ?? null;
  const nextLevel = data?.nextLevel ?? null;

  if (currentLevel === "aal2") return "aal2";
  if (currentLevel === "aal1" && nextLevel === "aal2") {
    return "aal1-needs-aal2";
  }
  return "no-factor";
}
