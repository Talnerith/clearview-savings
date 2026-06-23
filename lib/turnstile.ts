import "server-only";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

// Supabase Auth is the SOLE verifier of the single-use Turnstile token:
// it redeems the token by passing it to Cloudflare's siteverify via the
// `captchaToken` option on signUp / signInWithPassword /
// resetPasswordForEmail. We must NOT call siteverify ourselves — a
// Turnstile token can only be redeemed once, so verifying it here first
// consumes it and Supabase's own verification then fails with
// "captcha protection: request disallowed". See ADR 0003.
//
// This function therefore only confirms a token is *present*, so an auth
// action can short-circuit with the calm inline message before reaching
// Supabase when the widget produced no token at all. Bypassed in
// non-production (same NODE_ENV gate as the per-IP limiter) so local dev
// and CI never block on the widget.
export function checkTurnstilePresent(
  token: string | null | undefined,
): TurnstileResult {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true };
  }
  if (typeof token === "string" && token.trim().length > 0) {
    return { ok: true };
  }
  return { ok: false, reason: "missing-input-response" };
}

// True when a Supabase Auth error is a captcha rejection, so the caller
// renders the calm "please verify and try again" message instead of
// leaking GoTrue's raw "captcha protection: request disallowed (...)"
// text into the inline error banner.
export function isCaptchaRejection(message: string): boolean {
  return message.toLowerCase().includes("captcha");
}
