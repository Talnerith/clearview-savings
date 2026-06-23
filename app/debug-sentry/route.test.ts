import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("/debug-sentry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("404s in production so it can't be triggered against a live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = GET();
    expect(response.status).toBe(404);
  });

  it("throws in development to produce a Sentry-capturable error", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => GET()).toThrowError(/Sentry debug/);
  });

  it("throws in the test environment (any non-production NODE_ENV)", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => GET()).toThrowError(/Sentry debug/);
  });
});
