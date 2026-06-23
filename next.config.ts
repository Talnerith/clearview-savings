import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  // Sentry build-time options. Source-map upload is gated on the
  // SENTRY_AUTH_TOKEN env var being present (CI / Vercel build env);
  // local builds without the token skip the upload silently.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  // New option names; the old top-level disableLogger /
  // automaticVercelMonitors emit deprecation warnings on every dev start.
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
