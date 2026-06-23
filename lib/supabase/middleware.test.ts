import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getAalStateMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUserMock } }),
}));

vi.mock("@/lib/auth/aal", () => ({ getAalState: mocks.getAalStateMock }));

import { updateSession } from "./middleware";

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://app.test"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("updateSession AAL2 enforcement", () => {
  it("bounces an AAL1 session with a verified factor to /challenge", async () => {
    mocks.getAalStateMock.mockResolvedValue("aal1-needs-aal2");
    const res = await updateSession(requestFor("/caregiver"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/challenge");
  });

  it("lets a caregiver with no factor through at AAL1", async () => {
    mocks.getAalStateMock.mockResolvedValue("no-factor");
    const res = await updateSession(requestFor("/caregiver"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("lets an AAL2 session through", async () => {
    mocks.getAalStateMock.mockResolvedValue("aal2");
    const res = await updateSession(requestFor("/caregiver"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("never gates a patient route, even with a factor at AAL1", async () => {
    mocks.getAalStateMock.mockResolvedValue("aal1-needs-aal2");
    const res = await updateSession(requestFor("/patient/abc-123"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
    // The AAL check must not even run for patient routes.
    expect(mocks.getAalStateMock).not.toHaveBeenCalled();
  });

  it("challenges a post-reset AAL1 session that still has a factor", async () => {
    // A password reset lands on /caregiver at AAL1 (recovery-link session).
    // The middleware gate must catch it so the reset can't bypass MFA.
    mocks.getAalStateMock.mockResolvedValue("aal1-needs-aal2");
    const res = await updateSession(requestFor("/caregiver"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/challenge");
  });
});
