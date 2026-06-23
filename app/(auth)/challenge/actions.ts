"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth/next-path";
import { db } from "@/lib/db";
import { caregivers } from "@/lib/db/schema";
import { consumeRecoveryCode } from "@/lib/mfa/recovery-codes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Where to land after a successful step-up. Defaults to /caregiver, but the
// reset-password flow passes ?next=/reset-password so a forgotten-password
// caregiver with MFA can step up to AAL2 and then actually set the password
// (Supabase blocks updateUser at AAL1 when MFA is on).
function challengeWithError(message: string, next: string): string {
  const safe = safeNextPath(next);
  const params = new URLSearchParams({ error: message });
  if (safe !== "/caregiver") params.set("next", safe);
  return `/challenge?${params.toString()}`;
}

// Post-password TOTP step. The session is AAL1 here (the password step
// already ran); a correct code steps it up to AAL2 and lands the dashboard.
// Failed verifies ride Supabase Auth's built-in MFA-verify rate limit
// (M7 spec Resolved #4) — no custom limiter, no Turnstile on this step.

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function verifyChallengeAction(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next") as string | null);
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    redirect(challengeWithError("Enter the 6-digit code from your app.", next));
  }

  const supabase = await createSupabaseServerClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) {
    // No verified factor — nothing to challenge; let them through.
    redirect(next);
  }

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge) {
    redirect(challengeWithError("Could not verify the code. Please try again.", next));
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: parsed.data.code,
  });
  if (verifyError) {
    redirect(
      challengeWithError(
        "That code did not match. Check your app and try again.",
        next,
      ),
    );
  }

  // Session is now AAL2.
  redirect(next);
}

// Lost-device recovery. The session is AAL1 (password step only) and the
// caregiver can't produce a TOTP code, so they spend a one-time recovery
// code. A valid code removes the lost factor via the privileged admin API
// (the normal unenroll requires AAL2, which they don't have), leaving an
// AAL1 session with no factor — which clears the gate — and prompts
// re-enrollment. A recovery code can never itself mint AAL2 (M7 spec).

const recoverySchema = z.object({ code: z.string().trim().min(1) });

export async function recoverWithCodeAction(formData: FormData): Promise<void> {
  const parsed = recoverySchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    redirect("/challenge?mode=recovery&error=Enter+one+of+your+recovery+codes.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Resolve the caregiver directly from the user id — NOT via
  // getCurrentCaregiver(), which would bounce this AAL1-with-factor session
  // back to /challenge and loop.
  const rows = await db
    .select({ id: caregivers.id })
    .from(caregivers)
    .where(eq(caregivers.userId, user.id))
    .limit(1);
  const caregiver = rows[0];
  if (!caregiver) {
    redirect("/sign-in");
  }

  const consumed = await consumeRecoveryCode(
    db,
    caregiver.id,
    parsed.data.code,
  );
  if (!consumed) {
    redirect(
      "/challenge?mode=recovery&error=That+recovery+code+is+not+valid.+Check+and+try+again.",
    );
  }

  // Remove the verified TOTP factor with the privileged admin API.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (factor) {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: user.id,
    });

    // deleteFactor ran on a *separate* privileged client, so this session's
    // cookie still lists the (now-deleted) verified factor.
    // getAuthenticatorAssuranceLevel() reads factors off the session JWT, not
    // the server — without a refresh getAalState() stays "aal1-needs-aal2"
    // and the /caregiver redirect below bounces straight back to /challenge
    // (and so does a later TOTP verify, since the factor is really gone). A
    // refresh re-issues the JWT with no factor → "no-factor" → through.
    await supabase.auth.refreshSession();
  }

  // AAL1 with no factor now → getAalState() === "no-factor" → through the
  // middleware gate. The dashboard shows a calm re-enroll banner.
  redirect("/caregiver?reenroll=1");
}
