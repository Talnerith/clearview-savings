"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTurnstilePresent, isCaptchaRejection } from "@/lib/turnstile";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const ip = await getClientIdentifier();

  const turnstileToken =
    formData.get("cf-turnstile-response")?.toString() ?? null;
  const turnstile = checkTurnstilePresent(turnstileToken);
  if (!turnstile.ok) {
    redirect("/forgot-password?error=Please+verify+and+try+again.");
  }

  const { allowed } = await checkRateLimit(ip, "forgotPassword");
  if (!allowed) {
    redirect("/forgot-password?error=rate_limited");
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    redirect("/forgot-password?error=Please+enter+a+valid+email+address.");
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    `${headerStore.get("x-forwarded-proto") ?? "http"}://${headerStore.get("host") ?? "localhost:3000"}`;

  const supabase = await createSupabaseServerClient();
  // Collapse success and unknown-address failure into the same response so
  // the form cannot be used to enumerate registered emails. Supabase's
  // resetPasswordForEmail does not error on unknown addresses, so the only
  // error worth surfacing is a captcha rejection — otherwise the legitimate
  // caregiver would be told "we sent a link" when nothing was sent.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${origin}/reset-password`,
      captchaToken: turnstileToken ?? undefined,
    },
  );
  if (error && isCaptchaRejection(error.message)) {
    redirect("/forgot-password?error=Please+verify+and+try+again.");
  }

  redirect("/forgot-password?status=sent");
}
