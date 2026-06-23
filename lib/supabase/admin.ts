import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Privileged Supabase client built on SUPABASE_SECRET_KEY (full Admin Auth
// privileges). This is the FIRST request-reachable privileged call site in
// the app — before M7 the only SUPABASE_SECRET_KEY use was scripts/seed.ts
// (dev-only, never imported by a handler; see docs/security/rls-audit.md).
//
// Used for exactly one purpose: removing a caregiver's lost TOTP factor
// during recovery via auth.admin.mfa.deleteFactor(). A locked-out caregiver
// holds only an AAL1 session, so the normal supabase.auth.mfa.unenroll()
// (which requires AAL2) cannot reach it — the admin API is the honest path.
//
// `server-only` enforces at build time that this never ships to the client.
// Construction mirrors scripts/seed.ts (no session persistence / refresh).
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
