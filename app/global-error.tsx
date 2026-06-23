"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // global-error.tsx is the outermost boundary — it can render even when
  // the root layout itself fails. Keep it self-contained: no shared
  // components, no Brandmark, no FooterDisclosure. Patient UX rules:
  // never show a stack trace, never show "Error 500", offer a calm
  // path back to the home screen.
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
            Something went wrong on our side.
          </h1>
          <p
            style={{
              marginTop: "1rem",
              fontSize: "1.125rem",
              lineHeight: 1.5,
              color: "#334155",
            }}
          >
            Please return to the home page. We&rsquo;ve been notified and
            will look into it.
          </p>
          <p style={{ marginTop: "2rem" }}>
            {/* Plain anchor on purpose: global-error.tsx renders when the
             root layout itself has crashed, so we must not depend on
             Next's client-side router. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-block",
                background: "#047857",
                color: "white",
                textDecoration: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.375rem",
                fontWeight: 500,
              }}
            >
              Go to the home page
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
