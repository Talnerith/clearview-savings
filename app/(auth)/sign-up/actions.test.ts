import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new (class extends Error {
      url = url;
    })("NEXT_REDIRECT");
  }),
  headersMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIdentifierMock: vi.fn(),
  checkTurnstilePresentMock: vi.fn(),
  isCaptchaRejectionMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  signUpFnMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("next/headers", () => ({
  headers: () => mocks.headersMock(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimitMock,
  getClientIdentifier: mocks.getClientIdentifierMock,
}));

vi.mock("@/lib/turnstile", () => ({
  checkTurnstilePresent: mocks.checkTurnstilePresentMock,
  isCaptchaRejection: mocks.isCaptchaRejectionMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClientMock,
}));

import { signUpAction } from "./actions";

async function captureRedirect(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error("Expected redirect, none thrown");
}

describe("signUpAction Turnstile integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIdentifierMock.mockResolvedValue("1.2.3.4");
    mocks.checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 5 });
    mocks.headersMock.mockResolvedValue(
      new Map<string, string>([
        ["origin", "https://test.local"],
        ["host", "test.local"],
        ["x-forwarded-proto", "https"],
      ]),
    );
    mocks.signUpFnMock.mockResolvedValue({ error: null });
    mocks.createSupabaseServerClientMock.mockResolvedValue({
      auth: { signUp: mocks.signUpFnMock },
    });
    mocks.checkTurnstilePresentMock.mockReturnValue({ ok: true });
    mocks.isCaptchaRejectionMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("short-circuits with the calm error when no Turnstile token is present", async () => {
    mocks.checkTurnstilePresentMock.mockReturnValueOnce({
      ok: false,
      reason: "missing-input-response",
    });

    const form = new FormData();
    form.set("email", "caregiver@example.com");
    form.set("password", "longenough");

    const url = await captureRedirect(signUpAction(form));

    expect(url).toBe("/sign-up?error=Please+verify+and+try+again.");
    expect(mocks.signUpFnMock).not.toHaveBeenCalled();
    expect(mocks.checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("forwards captchaToken to supabase.auth.signUp on a present Turnstile token", async () => {
    const form = new FormData();
    form.set("cf-turnstile-response", "good-token");
    form.set("email", "caregiver@example.com");
    form.set("password", "longenough");

    const url = await captureRedirect(signUpAction(form));

    expect(url).toBe("/check-your-email?email=caregiver%40example.com");
    expect(mocks.checkTurnstilePresentMock).toHaveBeenCalledWith("good-token");
    expect(mocks.signUpFnMock).toHaveBeenCalledOnce();
    expect(mocks.signUpFnMock).toHaveBeenCalledWith({
      email: "caregiver@example.com",
      password: "longenough",
      options: {
        emailRedirectTo: "https://test.local/caregiver",
        captchaToken: "good-token",
      },
    });
  });

  it("maps a Supabase captcha rejection to the calm verify message", async () => {
    mocks.signUpFnMock.mockResolvedValueOnce({
      error: {
        message: "captcha protection: request disallowed (timeout-or-duplicate)",
      },
    });
    mocks.isCaptchaRejectionMock.mockReturnValueOnce(true);

    const form = new FormData();
    form.set("cf-turnstile-response", "good-token");
    form.set("email", "caregiver@example.com");
    form.set("password", "longenough");

    const url = await captureRedirect(signUpAction(form));

    expect(url).toBe("/sign-up?error=Please+verify+and+try+again.");
  });
});
