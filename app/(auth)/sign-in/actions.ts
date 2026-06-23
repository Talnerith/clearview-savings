"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAalState } from "@/lib/auth/aal";
import {
  checkEmailLockout,
  checkRateLimit,
  getClientIdentifier,
  recordFailedSignIn,
} from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTurnstilePresent, isCaptchaRejection } from "@/lib/turnstile";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signInAction(formData: FormData): Promise<void> {
  const ip = await getClientIdentifier();

  const turnstileToken =
    formData.get("cf-turnstile-response")?.toString() ?? null;
  const turnstile = checkTurnstilePresent(turnstileToken);
  if (!turnstile.ok) {
    redirect("/sign-in?error=Please+verify+and+try+again.");
  }

  const { allowed: ipAllowed } = await checkRateLimit(ip, "signIn");
  if (!ipAllowed) {
    redirect("/sign-in?error=rate_limited");
  }

  const emailRaw = formData.get("email")?.toString() ?? "";
  if (emailRaw) {
    const { allowed: emailAllowed } = await checkEmailLockout(emailRaw);
    if (!emailAllowed) {
      redirect("/sign-in?error=rate_limited");
    }
  }

  const parsed = signInSchema.safeParse({
    email: emailRaw,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/sign-in?error=Please+enter+a+valid+email+and+password.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken: turnstileToken ?? undefined },
  });
  if (error) {
    // A captcha rejection is not a credential failure — don't count it
    // toward the per-email lockout, and show the calm verify message
    // rather than leaking GoTrue's raw "request disallowed" text.
    if (isCaptchaRejection(error.message)) {
      redirect("/sign-in?error=Please+verify+and+try+again.");
    }
    await recordFailedSignIn(parsed.data.email, ip);
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  // Password is correct but the session is only AAL1. A caregiver with a
  // verified factor must clear the TOTP challenge before reaching the
  // dashboard; one without a factor signs in exactly as before.
  if ((await getAalState(supabase)) === "aal1-needs-aal2") {
    redirect("/challenge");
  }

  redirect("/caregiver");
}
