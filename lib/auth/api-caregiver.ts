import "server-only";

import { createClient } from "@supabase/supabase-js";

import { ensureCaregiver } from "@/lib/auth/ensure-caregiver";
import { findOwnedPatient } from "@/lib/auth/owned-patient";
import { ApiError } from "@/lib/api/respond";
import { type Caregiver, type Patient } from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// A stateless anon client used only to validate a bearer token via getUser().
// No session, no cookies — the token is passed explicitly to getUser(), which
// verifies it against the Auth server (authoritative).
function anonClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  }
  return token;
}

// Reads the `aal` claim out of a JWT payload without verifying the signature.
// Safe here ONLY because getUser() has already authenticated the token against
// the Auth server; we are merely reading a claim off the validated token.
function aalClaim(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

// Mirrors the web app's defense-in-depth AAL2 gate (see getCurrentCaregiver):
// if the caregiver has a verified MFA factor, an AAL1 token must not reach
// caregiver data — they must complete the step-up challenge first. We only pay
// the admin lookup when the token is NOT already aal2.
async function assertAalSatisfied(token: string, userId: string): Promise<void> {
  if (aalClaim(token) === "aal2") return;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    // Fail closed: if we can't confirm the factor state, don't grant access.
    throw new ApiError(403, "mfa_check_failed", "Could not verify your sign-in.");
  }
  const hasVerifiedFactor = (data.user?.factors ?? []).some(
    (f) => f.status === "verified",
  );
  if (hasVerifiedFactor) {
    throw new ApiError(
      403,
      "mfa_required",
      "Enter your authenticator code to continue.",
    );
  }
}

// Authenticates the bearer token, enforces the MFA/AAL gate, and resolves the
// app-level caregiver row (creating it on first sign-in). Throws ApiError on
// any failure; the route wraps it with jsonError().
export async function requireApiCaregiver(req: Request): Promise<Caregiver> {
  const token = bearerToken(req);

  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, "unauthenticated", "Your session has expired.");
  }

  await assertAalSatisfied(token, data.user.id);

  return ensureCaregiver(data.user);
}

// Caregiver + ownership in one step: 403 if the caregiver does not own the
// patient (or it doesn't exist). Never trusts the client-supplied id.
export async function requireApiPatient(
  req: Request,
  patientId: string,
): Promise<{ caregiver: Caregiver; patient: Patient }> {
  const caregiver = await requireApiCaregiver(req);
  const patient = await findOwnedPatient(caregiver.id, patientId);
  if (!patient) {
    throw new ApiError(403, "not_found", "That patient was not found.");
  }
  return { caregiver, patient };
}
