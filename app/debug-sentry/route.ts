// Dev-only synthetic-error endpoint for verifying Sentry capture.
// CRITICAL: must 404 in production so an unauthenticated visitor
// can't trigger error noise (and so deliberate crashes can't be used
// to probe error pages). Test pairs this gate at app/debug-sentry/route.test.ts.

export function GET(): Response {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  throw new Error("Sentry debug — synthetic error");
}
