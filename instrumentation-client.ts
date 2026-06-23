import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Per the M5 plan's locked Open-Question resolutions:
    // - errors at 1.0 (capture everything)
    // - traces at 0.1 (sample 10%)
    // - NO session replay; the patient UI must not be captured to disk
    //   anywhere on Sentry's side, even on error.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Filter common noise that isn't actionable.
    ignoreErrors: [
      /ResizeObserver loop/,
      /Non-Error promise rejection captured/,
      /AbortError/,
      // Common ad-blocker noise on inline analytics + tracking scripts.
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    beforeSend(event, hint) {
      const error = hint.originalException as
        | (Error & { name?: string; message?: string })
        | undefined;
      if (error?.name === "AbortError") return null;
      if (error?.name === "NotFoundError") return null;
      // Cancelled fetches / route transitions.
      if (error?.message?.includes("The user aborted a request")) return null;
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
