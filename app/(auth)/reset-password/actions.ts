"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAalState } from "@/lib/auth/aal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/reset-password?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createSupabaseServerClient();
  // The recovery-link callback established a session before this page
  // rendered. updateUser writes the new password against that session.
  // No session → updateUser errors with "Auth session missing!" and we
  // surface a calm message instead of leaking the SDK string.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/sign-in?error=Your+reset+link+has+expired.+Please+request+a+new+one.",
    );
  }

  // Supabase blocks updateUser({ password }) at AAL1 when MFA is enabled.
  // Step the caregiver up via the authenticator first (the page already
  // routes here, but a stale/JS-less submit can land at AAL1) — this
  // requires the second factor, it does not bypass it.
  if ((await getAalState(supabase)) === "aal1-needs-aal2") {
    redirect("/challenge?next=/reset-password");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    // Don't leak the raw SDK string (e.g. "AAL2 session is required...").
    // The AAL1+MFA case is handled above; anything else is a generic retry.
    redirect(
      "/reset-password?error=Could+not+update+your+password.+Please+try+again.",
    );
  }

  redirect("/caregiver");
}
