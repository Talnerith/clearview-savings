import crypto from "node:crypto";

import { sendAdminNotification } from "@/lib/admin-email";

// Sentry's internal-integration webhooks sign the raw body with
// HMAC-SHA256 and put the hex digest in the `sentry-hook-signature`
// header. The shared secret is the integration's client secret.
// Docs: https://docs.sentry.io/organization/integrations/integration-platform/webhooks/

interface SentryWebhookEvent {
  event_id?: string;
  level?: string;
  title?: string;
  web_url?: string;
  url?: string;
}

interface SentryWebhookPayload {
  data?: {
    event?: SentryWebhookEvent;
  };
}

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signatureHeader, "hex"),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook is registered in Sentry but the env var hasn't been set.
    // Fail closed — 503 so Sentry retries once env is configured.
    return new Response("Webhook not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("sentry-hook-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let parsed: SentryWebhookPayload;
  try {
    parsed = JSON.parse(rawBody) as SentryWebhookPayload;
  } catch {
    // Signature verified but body isn't valid JSON — accept and drop so
    // Sentry doesn't retry. Should not happen in practice.
    return Response.json({ ok: true });
  }

  const event = parsed.data?.event;
  if (event?.level === "fatal") {
    await sendAdminNotification({
      kind: "fatal-sentry",
      eventId: event.event_id ?? "unknown",
      title: event.title ?? "Untitled fatal event",
      url: event.web_url ?? event.url ?? "https://sentry.io/",
    });
  }

  return Response.json({ ok: true });
}
