"use client";

import { Turnstile } from "@marsidev/react-turnstile";

// Mounts the Cloudflare Turnstile widget inside the surrounding <form>.
// The widget injects a hidden `cf-turnstile-response` input the server
// action reads via formData.get("cf-turnstile-response").
//
// When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (dev or preview without
// configuration), we render nothing. The server verifier's NODE_ENV !==
// "production" bypass means the form still submits successfully in dev.
export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <Turnstile
      siteKey={siteKey}
      options={{ theme: "light", size: "normal" }}
    />
  );
}
