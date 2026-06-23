"use server";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { sendAdminNotification } from "@/lib/admin-email";
import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { mfaRecoveryCodes } from "@/lib/db/schema";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
} from "@/lib/mfa/recovery-codes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Server actions for the caregiver Security section. These are invoked as
// RPC from the MfaSecuritySection client component (they return values), not
// via <form action>, because the enrollment flow has to display the QR /
// secret the enroll call returns and then collect a code in a second step.
//
// AAL note: in M7 step 4 there is no AAL2 enforcement yet — enrollment
// happens at AAL1 by definition (verifying the first factor is what mints
// AAL2). Step 5 adds the AAL2 gate to getCurrentCaregiver(), which then
// protects regenerate (and the page) automatically.

const CODE_RE = /^\d{6}$/;

export type StartEnrollmentResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

export async function startTotpEnrollment(): Promise<StartEnrollmentResult> {
  await getCurrentCaregiver();
  const supabase = await createSupabaseServerClient();

  // Clear any leftover unverified TOTP factor from an abandoned attempt so a
  // retry doesn't trip Supabase's "factor already exists" error.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator (${new Date().toISOString().slice(0, 10)})`,
  });
  if (error || !data) {
    return { ok: false, error: "Couldn't start setup. Please try again." };
  }

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export type ConfirmEnrollmentResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: string };

export async function confirmTotpEnrollment(
  factorId: string,
  code: string,
): Promise<ConfirmEnrollmentResult> {
  const caregiver = await getCurrentCaregiver();
  if (!CODE_RE.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your app." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, error: "Couldn't verify the code. Please try again." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) {
    return {
      ok: false,
      error: "That code didn't match. Check your app and try again.",
    };
  }

  // Factor is verified and the session is now AAL2. Issue the one-time
  // recovery codes — shown once by the client, never retrievable after.
  const recoveryCodes = await generateRecoveryCodes(db, caregiver.id);
  revalidatePath("/caregiver/settings");
  return { ok: true, recoveryCodes };
}

export type RegenerateResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: string };

export async function regenerateRecoveryCodesAction(): Promise<RegenerateResult> {
  const caregiver = await getCurrentCaregiver();
  const supabase = await createSupabaseServerClient();

  // Only meaningful with a verified factor in place.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerified = (factors?.totp ?? []).some(
    (f) => f.status === "verified",
  );
  if (!hasVerified) {
    return { ok: false, error: "Two-factor authentication is not enabled." };
  }

  const recoveryCodes = await generateRecoveryCodes(db, caregiver.id);
  revalidatePath("/caregiver/settings");
  return { ok: true, recoveryCodes };
}

export type DisableResult = { ok: true } | { ok: false; error: string };

// Disable MFA. The caregiver is already AAL2 to be on this page (Step 5
// gate), but turning off protection is a security event, so we require a
// FRESH re-verification first (spec Resolved #5): a current 6-digit TOTP
// code or a one-time recovery code. On success we unenroll the factor
// (normal AAL2 API), drop the now-moot recovery codes, and notify ops.
export async function disableMfaAction(code: string): Promise<DisableResult> {
  const caregiver = await getCurrentCaregiver();
  const supabase = await createSupabaseServerClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) {
    return { ok: false, error: "Two-factor authentication is not enabled." };
  }

  const trimmed = code.trim();
  let verified = false;
  if (CODE_RE.test(trimmed)) {
    // Fresh TOTP code.
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (!challengeError && challenge) {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: trimmed,
      });
      verified = !verifyError;
    }
  } else {
    // Recovery code (single-use; consumed by this check).
    verified = await consumeRecoveryCode(db, caregiver.id, trimmed);
  }

  if (!verified) {
    return {
      ok: false,
      error:
        "That didn't match. Enter a current 6-digit code or a recovery code.",
    };
  }

  // Re-verification passed; AAL2 is present so the normal unenroll works.
  await supabase.auth.mfa.unenroll({ factorId: factor.id });
  await db
    .delete(mfaRecoveryCodes)
    .where(eq(mfaRecoveryCodes.caregiverId, caregiver.id));

  // Ops notification — failure must not block the user's action.
  try {
    await sendAdminNotification({
      kind: "mfa-disabled",
      caregiverEmail: caregiver.email,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    Sentry.captureException(err);
  }

  revalidatePath("/caregiver/settings");
  return { ok: true };
}
