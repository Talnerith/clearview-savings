import "server-only";

import type React from "react";
import { Resend } from "resend";

const FROM = '"Clearview Savings" <noreply@clearviewsavings.com>';
const DEFAULT_REPLY_TO = "support@clearviewsavings.com";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}): Promise<void> {
  const client = getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    react: args.react,
    replyTo: args.replyTo ?? DEFAULT_REPLY_TO,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
