import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limitMock: vi.fn(),
  incrMock: vi.fn(),
  expireMock: vi.fn(),
  getMock: vi.fn(),
  setMock: vi.fn(),
  sendAdminMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    incr: mocks.incrMock,
    expire: mocks.expireMock,
    get: mocks.getMock,
    set: mocks.setMock,
  })),
}));

vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn().mockImplementation(() => ({
    limit: mocks.limitMock,
  })) as unknown as {
    slidingWindow: (...args: unknown[]) => unknown;
  } & ReturnType<typeof vi.fn>;
  Ratelimit.slidingWindow = vi.fn().mockReturnValue({});
  return { Ratelimit };
});

vi.mock("@/lib/admin-email", () => ({
  sendAdminNotification: mocks.sendAdminMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureExceptionMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

import {
  __resetRateLimitCacheForTests,
  checkEmailLockout,
  checkRateLimit,
  recordFailedSignIn,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitCacheForTests();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "dummy-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses the limiter in non-production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const result = await checkRateLimit("1.2.3.4", "signIn");
    expect(result.allowed).toBe(true);
    expect(mocks.limitMock).not.toHaveBeenCalled();
  });

  it("returns allowed when limiter succeeds in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValueOnce({ success: true, remaining: 4 });
    const result = await checkRateLimit("1.2.3.4", "signIn");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(mocks.limitMock).toHaveBeenCalledWith("1.2.3.4");
  });

  it("returns denied and increments breach counter in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValueOnce({ success: false, remaining: 0 });
    mocks.incrMock.mockResolvedValueOnce(1);
    const result = await checkRateLimit("1.2.3.4", "signIn");
    expect(result.allowed).toBe(false);
    expect(mocks.incrMock).toHaveBeenCalledWith("rl:breach:signIn:1.2.3.4");
    expect(mocks.expireMock).toHaveBeenCalledWith(
      "rl:breach:signIn:1.2.3.4",
      300,
    );
  });

  it("fires admin notification once when breach counter hits 15", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValue({ success: false, remaining: 0 });
    mocks.incrMock.mockResolvedValueOnce(15);
    await checkRateLimit("1.2.3.4", "signIn");
    expect(mocks.sendAdminMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendAdminMock).toHaveBeenCalledWith({
      kind: "rate-limit-breach",
      ip: "1.2.3.4",
      endpoint: "signIn",
      attempts: 15,
    });
  });

  it("does not fire admin notification on counts other than 15", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValue({ success: false, remaining: 0 });

    mocks.incrMock.mockResolvedValueOnce(14);
    await checkRateLimit("1.2.3.4", "signIn");
    expect(mocks.sendAdminMock).not.toHaveBeenCalled();

    mocks.incrMock.mockResolvedValueOnce(16);
    await checkRateLimit("1.2.3.4", "signIn");
    expect(mocks.sendAdminMock).not.toHaveBeenCalled();
  });

  it("does not skip TTL setting on counts > 1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValueOnce({ success: false, remaining: 0 });
    mocks.incrMock.mockResolvedValueOnce(5);
    await checkRateLimit("1.2.3.4", "signIn");
    expect(mocks.expireMock).not.toHaveBeenCalled();
  });

  it("falls open when Upstash env is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    __resetRateLimitCacheForTests();
    const result = await checkRateLimit("1.2.3.4", "signIn");
    expect(result.allowed).toBe(true);
    expect(mocks.limitMock).not.toHaveBeenCalled();
  });

  it("swallows admin-notification errors to Sentry", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.limitMock.mockResolvedValue({ success: false, remaining: 0 });
    mocks.incrMock.mockResolvedValueOnce(15);
    const notifyError = new Error("resend down");
    mocks.sendAdminMock.mockRejectedValueOnce(notifyError);
    const result = await checkRateLimit("1.2.3.4", "signIn");
    expect(result.allowed).toBe(false);
    expect(mocks.captureExceptionMock).toHaveBeenCalledWith(notifyError);
  });
});

describe("checkEmailLockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitCacheForTests();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "dummy-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses in non-production without touching Redis", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const result = await checkEmailLockout("a@b.com");
    expect(result).toEqual({ allowed: true });
    expect(mocks.getMock).not.toHaveBeenCalled();
  });

  it("returns allowed when the lock key does not exist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getMock.mockResolvedValueOnce(null);
    const result = await checkEmailLockout("a@b.com");
    expect(result).toEqual({ allowed: true });
    expect(mocks.getMock).toHaveBeenCalledWith("rl:email-lock:a@b.com");
  });

  it("returns denied when the lock key exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getMock.mockResolvedValueOnce("1");
    const result = await checkEmailLockout("a@b.com");
    expect(result).toEqual({ allowed: false });
  });
});

describe("recordFailedSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitCacheForTests();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "dummy-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bypasses in non-production without touching Redis", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.incrMock).not.toHaveBeenCalled();
    expect(mocks.setMock).not.toHaveBeenCalled();
  });

  it("increments the fail counter and sets TTL on the first failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(1);
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.incrMock).toHaveBeenCalledWith("rl:email-fails:a@b.com");
    expect(mocks.expireMock).toHaveBeenCalledWith(
      "rl:email-fails:a@b.com",
      900,
    );
    expect(mocks.setMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminMock).not.toHaveBeenCalled();
  });

  it("does not set TTL again on subsequent failures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(3);
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.expireMock).not.toHaveBeenCalled();
    expect(mocks.setMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminMock).not.toHaveBeenCalled();
  });

  it("sets the lockout key and fires admin notification on the 5th failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(5);
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.setMock).toHaveBeenCalledWith(
      "rl:email-lock:a@b.com",
      "1",
      { ex: 900 },
    );
    expect(mocks.sendAdminMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendAdminMock).toHaveBeenCalledWith({
      kind: "email-lockout",
      email: "a@b.com",
      ip: "1.2.3.4",
      attemptsInWindow: 5,
    });
  });

  it("does not fire admin notification on failures 6+ within the window", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(6);
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.setMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminMock).not.toHaveBeenCalled();
  });

  it("swallows admin-notification errors to Sentry", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(5);
    const notifyError = new Error("resend down");
    mocks.sendAdminMock.mockRejectedValueOnce(notifyError);
    await recordFailedSignIn("a@b.com", "1.2.3.4");
    expect(mocks.captureExceptionMock).toHaveBeenCalledWith(notifyError);
  });

  it("normalizes email casing and whitespace so different inputs collide", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.incrMock.mockResolvedValueOnce(1);
    await recordFailedSignIn("  Foo@Bar.COM  ", "1.2.3.4");
    expect(mocks.incrMock).toHaveBeenCalledWith("rl:email-fails:foo@bar.com");

    mocks.incrMock.mockResolvedValueOnce(5);
    await recordFailedSignIn("foo@bar.com", "1.2.3.4");
    expect(mocks.setMock).toHaveBeenCalledWith(
      "rl:email-lock:foo@bar.com",
      "1",
      { ex: 900 },
    );
    expect(mocks.sendAdminMock).toHaveBeenCalledWith({
      kind: "email-lockout",
      email: "foo@bar.com",
      ip: "1.2.3.4",
      attemptsInWindow: 5,
    });
  });
});
