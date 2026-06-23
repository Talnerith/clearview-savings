import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  getClientIdentifierMock: vi.fn(),
  checkEmailLockoutMock: vi.fn(),
  recordFailedSignInMock: vi.fn(),
  checkTurnstilePresentMock: vi.fn(),
  isCaptchaRejectionMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  getAalStateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimitMock,
  getClientIdentifier: mocks.getClientIdentifierMock,
  checkEmailLockout: mocks.checkEmailLockoutMock,
  recordFailedSignIn: mocks.recordFailedSignInMock,
}));

vi.mock("@/lib/turnstile", () => ({
  checkTurnstilePresent: mocks.checkTurnstilePresentMock,
  isCaptchaRejection: mocks.isCaptchaRejectionMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClientMock,
}));

vi.mock("@/lib/auth/aal", () => ({ getAalState: mocks.getAalStateMock }));

import { signInAction } from "./actions";

async function captureRedirect(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error("Expected redirect, none thrown");
}

function signInForm(): FormData {
  const form = new FormData();
  form.set("cf-turnstile-response", "good-token");
  form.set("email", "c@example.com");
  form.set("password", "password123");
  return form;
}

describe("signInAction MFA two-step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIdentifierMock.mockResolvedValue("1.2.3.4");
    mocks.checkRateLimitMock.mockResolvedValue({ allowed: true });
    mocks.checkEmailLockoutMock.mockResolvedValue({ allowed: true });
    mocks.checkTurnstilePresentMock.mockReturnValue({ ok: true });
    mocks.isCaptchaRejectionMock.mockReturnValue(false);
    mocks.signInWithPasswordMock.mockResolvedValue({ error: null });
    mocks.createSupabaseServerClientMock.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPasswordMock },
    });
    mocks.getAalStateMock.mockResolvedValue("no-factor");
  });

  it("redirects to /challenge when the caregiver has a verified factor", async () => {
    mocks.getAalStateMock.mockResolvedValue("aal1-needs-aal2");
    const url = await captureRedirect(signInAction(signInForm()));
    expect(url).toBe("/challenge");
  });

  it("redirects straight to /caregiver when there is no factor", async () => {
    mocks.getAalStateMock.mockResolvedValue("no-factor");
    const url = await captureRedirect(signInAction(signInForm()));
    expect(url).toBe("/caregiver");
  });

  it("does not consult AAL state when the password itself is wrong", async () => {
    mocks.signInWithPasswordMock.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const url = await captureRedirect(signInAction(signInForm()));
    expect(url).toContain("/sign-in?error=");
    expect(mocks.getAalStateMock).not.toHaveBeenCalled();
  });
});
