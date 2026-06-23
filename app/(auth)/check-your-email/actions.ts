"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const resendSchema = z.object({
  email: z.string().email(),
});

const CALM_MESSAGE =
  "If that email needs confirmation, we sent a new link. Please wait a moment before trying again.";

export async function resendConfirmationAction(
  formData: FormData,
): Promise<void> {
  const parsed = resendSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    redirect(
      `/check-your-email?status=${encodeURIComponent(CALM_MESSAGE)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  // Discard the result either way — we never reveal whether the
  // email is registered. Errors here (rate limit, unknown email,
  // already-confirmed) collapse into the same calm message.
  try {
    await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
    });
  } catch {
    // ignore
  }

  redirect(
    `/check-your-email?email=${encodeURIComponent(parsed.data.email)}` +
      `&status=${encodeURIComponent(CALM_MESSAGE)}`,
  );
}
