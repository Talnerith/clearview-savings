import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email",
  "email_change",
]);

function publicOrigin(request: NextRequest, fallback: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return fallback;
}

function resolveNext(rawNext: string | null, origin: string): URL {
  const fallback = new URL("/caregiver", origin);
  if (!rawNext) return fallback;
  try {
    const candidate = new URL(rawNext, origin);
    // Defense in depth: never redirect to a different origin than the
    // one that handled the callback. Prevents open-redirect via a
    // crafted ?next= even if a token_hash were leaked.
    if (candidate.origin !== origin) return fallback;
    return candidate;
  } catch {
    return fallback;
  }
}

function failRedirect(origin: string): NextResponse {
  return NextResponse.redirect(
    new URL(
      `/sign-in?error=${encodeURIComponent("Could not confirm your email. Try again.")}`,
      origin,
    ),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = publicOrigin(request, url.origin);
  const next = resolveNext(url.searchParams.get("next"), origin);

  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const code = url.searchParams.get("code");

  const supabase = await createSupabaseServerClient();

  if (tokenHash && rawType && ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: rawType as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(next);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(next);
    }
  }

  return failRedirect(origin);
}
