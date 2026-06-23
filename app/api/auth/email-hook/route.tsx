import { Webhook } from "standardwebhooks";

import { ConfirmEmail } from "@/emails/confirm-email";
import { ResetPassword } from "@/emails/reset-password";
import { sendEmail } from "@/lib/email";

type EmailActionType =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change";

interface SupabaseEmailHookPayload {
  user: {
    id: string;
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailActionType;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

function getHookSecret(): string {
  const raw = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!raw) {
    throw new Error("SUPABASE_AUTH_HOOK_SECRET is not set");
  }
  // Supabase dashboard issues secrets as "v1,whsec_<base64>".
  // standardwebhooks' Webhook constructor wants the base64 portion only.
  return raw.replace(/^v1,whsec_/, "");
}

function getAppBaseUrl(req: Request): string {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Fallback: derive from the inbound webhook's forwarded headers
  // so a misconfigured deploy still produces a working link
  // pointing at the host that just received this request.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  throw new Error("APP_BASE_URL is not set and no host headers present");
}

function buildCallbackUrl(
  appBaseUrl: string,
  tokenHash: string,
  type: EmailActionType,
  redirectTo: string | undefined,
): string {
  const next = redirectTo && redirectTo.length > 0 ? redirectTo : "/caregiver";
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next,
  });
  return `${appBaseUrl}/auth/callback?${params.toString()}`;
}

export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let parsed: SupabaseEmailHookPayload;
  try {
    const wh = new Webhook(getHookSecret());
    parsed = wh.verify(payload, headers) as SupabaseEmailHookPayload;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  const { user, email_data } = parsed;
  const { email_action_type, token_hash, redirect_to } = email_data;

  const appBaseUrl = getAppBaseUrl(req);
  const confirmUrl = buildCallbackUrl(
    appBaseUrl,
    token_hash,
    email_action_type,
    redirect_to,
  );

  switch (email_action_type) {
    case "signup":
      await sendEmail({
        to: user.email,
        subject: "Confirm your email at Clearview Savings",
        react: <ConfirmEmail confirmUrl={confirmUrl} />,
      });
      break;
    case "recovery":
      await sendEmail({
        to: user.email,
        subject: "Reset your Clearview Savings password",
        react: <ResetPassword resetUrl={confirmUrl} />,
      });
      break;
    // invite, magiclink, email_change: out of scope for M5 — no-op.
    default:
      break;
  }

  return Response.json({ ok: true });
}
