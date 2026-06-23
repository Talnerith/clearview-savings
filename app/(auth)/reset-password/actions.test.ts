import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  getAalStateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClientMock,
}));

vi.mock("@/lib/auth/aal", () => ({
  getAalState: mocks.getAalStateMock,
}));

import { resetPasswordAction } from "./actions";

async function captureRedirect(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error("Expected redirect, none thrown");
}

function passwordForm(password: string): FormData {
  const form = new FormData();
  form.set("password", password);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: mocks.getUserMock,
      updateUser: mocks.updateUserMock,
    },
  });
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.updateUserMock.mockResolvedValue({ data: {}, error: null });
  mocks.getAalStateMock.mockResolvedValue("no-factor");
});

describe("resetPasswordAction", () => {
  it("updates the password and lands the dashboard at sufficient AAL", async () => {
    const url = await captureRedirect(resetPasswordAction(passwordForm("hunter2hunter")));
    expect(url).toBe("/caregiver");
    expect(mocks.updateUserMock).toHaveBeenCalledWith({
      password: "hunter2hunter",
    });
  });

  it("steps up via the authenticator before changing the password under MFA", async () => {
    // Recovery link gives an AAL1 session; the verified factor means MFA is on.
    mocks.getAalStateMock.mockResolvedValue("aal1-needs-aal2");
    const url = await captureRedirect(resetPasswordAction(passwordForm("hunter2hunter")));
    expect(url).toBe("/challenge?next=/reset-password");
    // The password must NOT be set from an AAL1 session — criterion F.
    expect(mocks.updateUserMock).not.toHaveBeenCalled();
  });

  it("shows a calm message and never leaks the raw SDK error", async () => {
    mocks.updateUserMock.mockResolvedValue({
      data: null,
      error: { message: "AAL2 session is required to update email or password" },
    });
    const url = await captureRedirect(resetPasswordAction(passwordForm("hunter2hunter")));
    expect(url).toBe(
      "/reset-password?error=Could+not+update+your+password.+Please+try+again.",
    );
    expect(url).not.toContain("AAL2");
  });

  it("sends an expired-link visitor back to sign-in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } });
    const url = await captureRedirect(resetPasswordAction(passwordForm("hunter2hunter")));
    expect(url).toBe(
      "/sign-in?error=Your+reset+link+has+expired.+Please+request+a+new+one.",
    );
    expect(mocks.updateUserMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short password without touching Supabase", async () => {
    const url = await captureRedirect(resetPasswordAction(passwordForm("short")));
    expect(url).toContain("/reset-password?error=");
    expect(mocks.createSupabaseServerClientMock).not.toHaveBeenCalled();
  });
});
