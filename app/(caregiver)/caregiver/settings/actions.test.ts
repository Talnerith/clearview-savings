import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentCaregiverMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  generateRecoveryCodesMock: vi.fn(),
  consumeRecoveryCodeMock: vi.fn(),
  sendAdminNotificationMock: vi.fn(),
  dbDeleteWhereMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  // MFA client method mocks
  listFactorsMock: vi.fn(),
  unenrollMock: vi.fn(),
  enrollMock: vi.fn(),
  challengeMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePathMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/auth/current-caregiver", () => ({
  getCurrentCaregiver: mocks.getCurrentCaregiverMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClientMock,
}));

vi.mock("@/lib/admin-email", () => ({
  sendAdminNotification: mocks.sendAdminNotificationMock,
}));

vi.mock("@/lib/mfa/recovery-codes", () => ({
  generateRecoveryCodes: mocks.generateRecoveryCodesMock,
  consumeRecoveryCode: mocks.consumeRecoveryCodeMock,
}));

vi.mock("@/lib/db", () => ({
  db: { delete: () => ({ where: mocks.dbDeleteWhereMock }) },
}));

import {
  confirmTotpEnrollment,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startTotpEnrollment,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentCaregiverMock.mockResolvedValue({
    id: "caregiver-1",
    email: "c@example.com",
  });
  mocks.createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      mfa: {
        listFactors: mocks.listFactorsMock,
        unenroll: mocks.unenrollMock,
        enroll: mocks.enrollMock,
        challenge: mocks.challengeMock,
        verify: mocks.verifyMock,
      },
    },
  });
  mocks.generateRecoveryCodesMock.mockResolvedValue([
    "ABCDE-FGHIJ",
    "KLMNP-QRSTU",
  ]);
  mocks.consumeRecoveryCodeMock.mockResolvedValue(true);
  mocks.sendAdminNotificationMock.mockResolvedValue(undefined);
  mocks.dbDeleteWhereMock.mockResolvedValue(undefined);
  mocks.unenrollMock.mockResolvedValue({ data: {}, error: null });
});

describe("startTotpEnrollment", () => {
  it("clears a leftover unverified factor, then enrolls and returns QR + secret", async () => {
    mocks.listFactorsMock.mockResolvedValue({
      data: {
        all: [
          { id: "stale", factor_type: "totp", status: "unverified" },
          { id: "phone", factor_type: "phone", status: "unverified" },
        ],
      },
    });
    mocks.unenrollMock.mockResolvedValue({ data: {}, error: null });
    mocks.enrollMock.mockResolvedValue({
      data: {
        id: "factor-new",
        totp: { qr_code: "data:image/svg+xml,<svg/>", secret: "SECRET123" },
      },
      error: null,
    });

    const result = await startTotpEnrollment();

    // Only the stale *unverified TOTP* factor is removed; the phone one is left.
    expect(mocks.unenrollMock).toHaveBeenCalledOnce();
    expect(mocks.unenrollMock).toHaveBeenCalledWith({ factorId: "stale" });
    expect(result).toEqual({
      ok: true,
      factorId: "factor-new",
      qrCode: "data:image/svg+xml,<svg/>",
      secret: "SECRET123",
    });
  });

  it("returns a calm error when enroll fails", async () => {
    mocks.listFactorsMock.mockResolvedValue({ data: { all: [] } });
    mocks.enrollMock.mockResolvedValue({
      data: null,
      error: { message: "MFA disabled" },
    });

    const result = await startTotpEnrollment();
    expect(result).toEqual({
      ok: false,
      error: "Couldn't start setup. Please try again.",
    });
  });
});

describe("confirmTotpEnrollment", () => {
  it("rejects a malformed code without calling Supabase or issuing codes", async () => {
    const result = await confirmTotpEnrollment("factor-1", "12ab");
    expect(result.ok).toBe(false);
    expect(mocks.challengeMock).not.toHaveBeenCalled();
    expect(mocks.generateRecoveryCodesMock).not.toHaveBeenCalled();
  });

  it("verifies the code, issues recovery codes, and revalidates", async () => {
    mocks.challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mocks.verifyMock.mockResolvedValue({ data: {}, error: null });

    const result = await confirmTotpEnrollment("factor-1", "123456");

    expect(mocks.verifyMock).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
    expect(mocks.generateRecoveryCodesMock).toHaveBeenCalledWith(
      expect.anything(),
      "caregiver-1",
    );
    expect(result).toEqual({
      ok: true,
      recoveryCodes: ["ABCDE-FGHIJ", "KLMNP-QRSTU"],
    });
    expect(mocks.revalidatePathMock).toHaveBeenCalledWith("/caregiver/settings");
  });

  it("returns the mismatch error and issues no codes when verify fails", async () => {
    mocks.challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mocks.verifyMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    });

    const result = await confirmTotpEnrollment("factor-1", "000000");

    expect(result).toEqual({
      ok: false,
      error: "That code didn't match. Check your app and try again.",
    });
    expect(mocks.generateRecoveryCodesMock).not.toHaveBeenCalled();
  });
});

describe("regenerateRecoveryCodesAction", () => {
  it("refuses when no verified factor exists", async () => {
    mocks.listFactorsMock.mockResolvedValue({ data: { totp: [] } });
    const result = await regenerateRecoveryCodesAction();
    expect(result).toEqual({
      ok: false,
      error: "Two-factor authentication is not enabled.",
    });
    expect(mocks.generateRecoveryCodesMock).not.toHaveBeenCalled();
  });

  it("issues a fresh set when a verified factor exists", async () => {
    mocks.listFactorsMock.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }] },
    });
    const result = await regenerateRecoveryCodesAction();
    expect(result).toEqual({
      ok: true,
      recoveryCodes: ["ABCDE-FGHIJ", "KLMNP-QRSTU"],
    });
  });
});

describe("disableMfaAction", () => {
  beforeEach(() => {
    mocks.listFactorsMock.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }] },
    });
  });

  it("refuses when no verified factor exists", async () => {
    mocks.listFactorsMock.mockResolvedValue({ data: { totp: [] } });
    const result = await disableMfaAction("123456");
    expect(result).toEqual({
      ok: false,
      error: "Two-factor authentication is not enabled.",
    });
    expect(mocks.unenrollMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotificationMock).not.toHaveBeenCalled();
  });

  it("disables via a fresh TOTP code, clears codes, and notifies ops", async () => {
    mocks.challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mocks.verifyMock.mockResolvedValue({ data: {}, error: null });

    const result = await disableMfaAction("123456");

    expect(result).toEqual({ ok: true });
    expect(mocks.unenrollMock).toHaveBeenCalledWith({ factorId: "f1" });
    expect(mocks.dbDeleteWhereMock).toHaveBeenCalledOnce();
    expect(mocks.sendAdminNotificationMock).toHaveBeenCalledWith({
      kind: "mfa-disabled",
      caregiverEmail: "c@example.com",
      caregiverId: "caregiver-1",
    });
    // A 6-digit code is verified as TOTP, not spent as a recovery code.
    expect(mocks.consumeRecoveryCodeMock).not.toHaveBeenCalled();
  });

  it("disables via a recovery code and notifies ops", async () => {
    const result = await disableMfaAction("ABCDE-FGHIJ");

    expect(result).toEqual({ ok: true });
    expect(mocks.consumeRecoveryCodeMock).toHaveBeenCalledWith(
      expect.anything(),
      "caregiver-1",
      "ABCDE-FGHIJ",
    );
    expect(mocks.unenrollMock).toHaveBeenCalledWith({ factorId: "f1" });
    expect(mocks.sendAdminNotificationMock).toHaveBeenCalledOnce();
    // A non-numeric code is not run through the TOTP challenge path.
    expect(mocks.challengeMock).not.toHaveBeenCalled();
  });

  it("refuses to disable when re-verification fails", async () => {
    mocks.challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mocks.verifyMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    });

    const result = await disableMfaAction("000000");

    expect(result.ok).toBe(false);
    expect(mocks.unenrollMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotificationMock).not.toHaveBeenCalled();
  });
});
