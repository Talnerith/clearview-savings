import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  listFactorsMock: vi.fn(),
  challengeMock: vi.fn(),
  verifyMock: vi.fn(),
  getUserMock: vi.fn(),
  limitMock: vi.fn(),
  consumeRecoveryCodeMock: vi.fn(),
  deleteFactorMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClientMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.limitMock }),
      }),
    }),
  },
}));

vi.mock("@/lib/mfa/recovery-codes", () => ({
  consumeRecoveryCode: mocks.consumeRecoveryCodeMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { mfa: { deleteFactor: mocks.deleteFactorMock } } },
  }),
}));

import { recoverWithCodeAction, verifyChallengeAction } from "./actions";

async function captureRedirect(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error("Expected redirect, none thrown");
}

function codeForm(code: string, next?: string): FormData {
  const form = new FormData();
  form.set("code", code);
  if (next !== undefined) form.set("next", next);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: mocks.getUserMock,
      refreshSession: mocks.refreshSessionMock,
      mfa: {
        listFactors: mocks.listFactorsMock,
        challenge: mocks.challengeMock,
        verify: mocks.verifyMock,
      },
    },
  });
  mocks.refreshSessionMock.mockResolvedValue({ data: {}, error: null });
  mocks.listFactorsMock.mockResolvedValue({
    data: { totp: [{ id: "f1", status: "verified" }] },
  });
  mocks.challengeMock.mockResolvedValue({ data: { id: "ch1" }, error: null });
  mocks.verifyMock.mockResolvedValue({ data: {}, error: null });
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.limitMock.mockResolvedValue([{ id: "caregiver-1" }]);
  mocks.consumeRecoveryCodeMock.mockResolvedValue(true);
  mocks.deleteFactorMock.mockResolvedValue({ data: {}, error: null });
});

function recoveryForm(code: string): FormData {
  const form = new FormData();
  form.set("code", code);
  return form;
}

describe("verifyChallengeAction", () => {
  it("steps up to AAL2 and lands the dashboard on a correct code", async () => {
    const url = await captureRedirect(verifyChallengeAction(codeForm("123456")));
    expect(url).toBe("/caregiver");
    expect(mocks.verifyMock).toHaveBeenCalledWith({
      factorId: "f1",
      challengeId: "ch1",
      code: "123456",
    });
  });

  it("shows a calm inline error and does not step up on a wrong code", async () => {
    mocks.verifyMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    });
    const url = await captureRedirect(verifyChallengeAction(codeForm("000000")));
    expect(url).toBe(
      "/challenge?error=That+code+did+not+match.+Check+your+app+and+try+again.",
    );
  });

  it("rejects a malformed code without calling Supabase", async () => {
    const url = await captureRedirect(verifyChallengeAction(codeForm("12ab")));
    expect(url).toBe("/challenge?error=Enter+the+6-digit+code+from+your+app.");
    expect(mocks.listFactorsMock).not.toHaveBeenCalled();
  });

  it("lets a session with no verified factor through to the dashboard", async () => {
    mocks.listFactorsMock.mockResolvedValue({ data: { totp: [] } });
    const url = await captureRedirect(verifyChallengeAction(codeForm("123456")));
    expect(url).toBe("/caregiver");
    expect(mocks.challengeMock).not.toHaveBeenCalled();
  });

  it("returns to a safe `next` target after step-up (reset-password flow)", async () => {
    const url = await captureRedirect(
      verifyChallengeAction(codeForm("123456", "/reset-password")),
    );
    expect(url).toBe("/reset-password");
  });

  it("ignores an off-origin `next` and falls back to the dashboard", async () => {
    const url = await captureRedirect(
      verifyChallengeAction(codeForm("123456", "https://evil.example")),
    );
    expect(url).toBe("/caregiver");
  });

  it("preserves a safe `next` when a wrong code bounces back to /challenge", async () => {
    mocks.verifyMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    });
    const url = await captureRedirect(
      verifyChallengeAction(codeForm("000000", "/reset-password")),
    );
    expect(url).toBe(
      "/challenge?error=That+code+did+not+match.+Check+your+app+and+try+again.&next=%2Freset-password",
    );
  });
});

describe("recoverWithCodeAction", () => {
  it("consumes a valid code, unenrolls the lost factor, and lands re-enroll", async () => {
    const url = await captureRedirect(
      recoverWithCodeAction(recoveryForm("ABCDE-FGHIJ")),
    );
    expect(url).toBe("/caregiver?reenroll=1");
    expect(mocks.consumeRecoveryCodeMock).toHaveBeenCalledWith(
      expect.anything(),
      "caregiver-1",
      "ABCDE-FGHIJ",
    );
    expect(mocks.deleteFactorMock).toHaveBeenCalledWith({
      id: "f1",
      userId: "user-1",
    });
    // The session cookie still lists the deleted factor until refreshed;
    // without this the /caregiver redirect loops back to /challenge.
    expect(mocks.refreshSessionMock).toHaveBeenCalled();
  });

  it("does not refresh the session when there was no factor to remove", async () => {
    mocks.listFactorsMock.mockResolvedValue({ data: { totp: [] } });
    const url = await captureRedirect(
      recoverWithCodeAction(recoveryForm("ABCDE-FGHIJ")),
    );
    expect(url).toBe("/caregiver?reenroll=1");
    expect(mocks.deleteFactorMock).not.toHaveBeenCalled();
    expect(mocks.refreshSessionMock).not.toHaveBeenCalled();
  });

  it("shows an inline error and never touches the admin API on an invalid code", async () => {
    mocks.consumeRecoveryCodeMock.mockResolvedValue(false);
    const url = await captureRedirect(
      recoverWithCodeAction(recoveryForm("WRONG-CODE0")),
    );
    expect(url).toBe(
      "/challenge?mode=recovery&error=That+recovery+code+is+not+valid.+Check+and+try+again.",
    );
    expect(mocks.deleteFactorMock).not.toHaveBeenCalled();
  });

  it("rejects an empty code without consuming anything", async () => {
    const url = await captureRedirect(recoverWithCodeAction(recoveryForm("  ")));
    expect(url).toBe(
      "/challenge?mode=recovery&error=Enter+one+of+your+recovery+codes.",
    );
    expect(mocks.consumeRecoveryCodeMock).not.toHaveBeenCalled();
  });
});
