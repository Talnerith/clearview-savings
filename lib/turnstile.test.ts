import { afterEach, describe, expect, it, vi } from "vitest";

import { checkTurnstilePresent, isCaptchaRejection } from "./turnstile";

describe("checkTurnstilePresent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses in non-production regardless of token", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(checkTurnstilePresent(null)).toEqual({ ok: true });
    expect(checkTurnstilePresent("")).toEqual({ ok: true });
  });

  it("returns ok in production when a non-empty token is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(checkTurnstilePresent("some-token")).toEqual({ ok: true });
  });

  it("rejects a missing token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(checkTurnstilePresent(null)).toEqual({
      ok: false,
      reason: "missing-input-response",
    });
    expect(checkTurnstilePresent(undefined)).toEqual({
      ok: false,
      reason: "missing-input-response",
    });
  });

  it("rejects a whitespace-only token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(checkTurnstilePresent("   ")).toEqual({
      ok: false,
      reason: "missing-input-response",
    });
  });
});

describe("isCaptchaRejection", () => {
  it("matches GoTrue's captcha rejection message", () => {
    expect(
      isCaptchaRejection(
        "captcha protection: request disallowed (timeout-or-duplicate)",
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCaptchaRejection("Captcha verification process failed")).toBe(
      true,
    );
  });

  it("does not match unrelated auth errors", () => {
    expect(isCaptchaRejection("Invalid login credentials")).toBe(false);
    expect(isCaptchaRejection("Email not confirmed")).toBe(false);
  });
});
