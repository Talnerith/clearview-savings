import "server-only";

import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

import { sendAdminNotification } from "@/lib/admin-email";

export type LimitedAction = "signUp" | "signIn" | "forgotPassword";

const WINDOW = "1 m" as const;
const LIMIT = 5;
const BREACH_NOTIFY_AT = 15;
const BREACH_KEY_TTL_SECONDS = 300;

// Per-email lockout: 5 failed sign-ins to the same email within a
// 15-minute window → email locked for 15 minutes regardless of source
// IP. Closes the "attacker rotates IPs against one known email" gap
// the per-IP limiter leaves open.
const EMAIL_LOCKOUT_THRESHOLD = 5;
const EMAIL_FAIL_WINDOW_SECONDS = 60 * 15;
const EMAIL_LOCKOUT_DURATION_SECONDS = 60 * 15;

let redisInstance: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisInstance !== undefined) return redisInstance;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisInstance = null;
    return null;
  }
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

let limiterCache: Record<LimitedAction, Ratelimit> | null | undefined;
function getLimiters(): Record<LimitedAction, Ratelimit> | null {
  if (limiterCache !== undefined) return limiterCache;
  const redis = getRedis();
  if (!redis) {
    limiterCache = null;
    return null;
  }
  limiterCache = {
    signUp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
      prefix: "rl:signUp",
    }),
    signIn: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
      prefix: "rl:signIn",
    }),
    forgotPassword: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
      prefix: "rl:forgotPassword",
    }),
  };
  return limiterCache;
}

// Test-only — resets the cached redis + limiters so a vi.mock can take effect
// after this module has already been imported once.
export function __resetRateLimitCacheForTests(): void {
  redisInstance = undefined;
  limiterCache = undefined;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

// Returns { allowed: true } in non-production and when Upstash isn't
// configured — so dev and CI never hit the limiter and a misconfigured
// production never locks every user out.
export async function checkRateLimit(
  identifier: string,
  action: LimitedAction,
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, remaining: LIMIT };
  }

  const limiters = getLimiters();
  if (!limiters) {
    return { allowed: true, remaining: LIMIT };
  }

  const result = await limiters[action].limit(identifier);

  if (!result.success) {
    await trackBreach(identifier, action);
  }

  return { allowed: result.success, remaining: result.remaining };
}

// Counts denied attempts per IP+endpoint into a separate Redis key with a
// short TTL, so we can fire one admin notification per sustained spike
// rather than one per blocked attempt.
async function trackBreach(
  identifier: string,
  action: LimitedAction,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `rl:breach:${action}:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, BREACH_KEY_TTL_SECONDS);
  }

  if (count === BREACH_NOTIFY_AT) {
    try {
      await sendAdminNotification({
        kind: "rate-limit-breach",
        ip: identifier,
        endpoint: action,
        attempts: count,
      });
    } catch (err) {
      // The auth path must keep working even if Resend or the admin
      // mailbox is down — Sentry catches the failure so we still see it.
      Sentry.captureException(err);
    }
  }
}

// Returns the client IP from forwarded headers. Vercel populates
// x-forwarded-for in production; dev falls through to "unknown" but
// the production-only gate above means that branch never runs in dev.
export async function getClientIdentifier(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}

// Lowercased + trimmed. Correlates different IPs against the same
// email and different casings of the same address. We don't apply
// Gmail-style dot/plus folding — Supabase Auth treats `a@x` and
// `a+b@x` as distinct accounts, so we mirror that.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailFailKey(email: string): string {
  return `rl:email-fails:${normalizeEmail(email)}`;
}

function emailLockKey(email: string): string {
  return `rl:email-lock:${normalizeEmail(email)}`;
}

// Returns { allowed: false } when the email is currently locked.
// Bypasses in non-production and when Upstash isn't configured —
// same closed-but-fail-open posture as checkRateLimit, so a
// misconfigured production never locks every caregiver out.
export async function checkEmailLockout(
  email: string,
): Promise<{ allowed: boolean }> {
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true };
  }

  const redis = getRedis();
  if (!redis) return { allowed: true };

  const locked = await redis.get(emailLockKey(email));
  return { allowed: locked === null };
}

// Records a failed sign-in attempt against an email. On the Nth
// failure within the 15-minute window (where N === threshold) sets
// the lockout key and fires a one-shot admin notification. The
// atomic INCR + count-equality check makes the lockout-set and
// admin-notify exactly-once per lockout event, even under
// concurrent failed attempts.
export async function recordFailedSignIn(
  email: string,
  ip: string,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const redis = getRedis();
  if (!redis) return;

  const failKey = emailFailKey(email);
  const count = await redis.incr(failKey);
  if (count === 1) {
    await redis.expire(failKey, EMAIL_FAIL_WINDOW_SECONDS);
  }

  if (count === EMAIL_LOCKOUT_THRESHOLD) {
    await redis.set(emailLockKey(email), "1", {
      ex: EMAIL_LOCKOUT_DURATION_SECONDS,
    });
    try {
      await sendAdminNotification({
        kind: "email-lockout",
        email: normalizeEmail(email),
        ip,
        attemptsInWindow: count,
      });
    } catch (err) {
      // The auth path must keep working even if Resend or the admin
      // mailbox is down — Sentry catches the failure so we still see it.
      Sentry.captureException(err);
    }
  }
}
