"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTurnstilePresent, isCaptchaRejection } from "@/lib/turnstile";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function signUpAction(formData: FormData): Promise<void> {
  const ip = await getClientIdentifier();

  const turnstileToken =
    formData.get("cf-turnstile-response")?.toString() ?? null;
  const turnstile = checkTurnstilePresent(turnstileToken);
  if (!turnstile.ok) {
    redirect("/sign-up?error=Please+verify+and+try+again.");
  }

  const { allowed } = await checkRateLimit(ip, "signUp");
  if (!allowed) {
    redirect("/sign-up?error=rate_limited");
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/sign-up?error=${encodeURIComponent(message)}`);
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    `${headerStore.get("x-forwarded-proto") ?? "http"}://${headerStore.get("host") ?? "localhost:3000"}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${origin}/caregiver`,
      captchaToken: turnstileToken ?? undefined,
    },
  });
  if (error) {
    if (isCaptchaRejection(error.message)) {
      redirect("/sign-up?error=Please+verify+and+try+again.");
    }
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/check-your-email?email=${encodeURIComponent(parsed.data.email)}`);
}
