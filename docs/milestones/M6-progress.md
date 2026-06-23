# M6 progress — auth hardening

**M6 complete.** Closed out 2026-05-24.
Last commit: `5695db3` (fix: make Supabase the sole Turnstile verifier).

All seven steps are done, pushed to origin/master, and the production
smoke test passed all six cases. The smoke surfaced one bug — a
double-verified Turnstile token — fixed in `5695db3` before close-out
(see Step 7 below and ADR 0003).

## Done

**Step 1 — external setup (user-driven):**

- Cloudflare Turnstile site created (Managed mode; hostnames
  `clearviewsavings.com`, `www.clearviewsavings.com`, `localhost`)
- Supabase Auth → Bot and Abuse Protection → CAPTCHA toggled on,
  Turnstile secret pasted into the dashboard
- Env vars added to Vercel:
  - **Production:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
    `TURNSTILE_SECRET_KEY`
  - **Preview:** same two + `TURNSTILE_TEST_BYPASS_KEY` (32-char
    random hex)
  - Production does **not** have `TURNSTILE_TEST_BYPASS_KEY`
    (intentional — the sentinel must be meaningless in prod)
- `.env.local` mirrors Production for local dev

**Plan + spec scaffolding (commit `dbeedbd`):**

- `docs/milestones/M6.md` — 7-step implementation plan
- `docs/specs/M6.md` — one-line runbook-path correction
  (`docs/admin-runbook.md` → runbook section of
  `docs/security/auth-hardening.md`)
- `.env.example` — Turnstile env-var documentation

**Step 2 — Turnstile server verifier (commit `aa8bd1e`):**

- `lib/turnstile.ts` — `verifyTurnstileToken(token, ip)`,
  closed-fail
- `lib/turnstile.test.ts` — 8 unit tests
- **Superseded during Step 7** — this self-managed `siteverify`
  verifier was removed in `5695db3`; Supabase is now the sole
  verifier. See Step 7 + ADR 0003.

**Steps 3+4 — per-email sign-in lockout (commit `35e16c7`):**

- `lib/rate-limit.ts` — `checkEmailLockout`, `recordFailedSignIn`,
  email normalization helpers, lockout constants
- `lib/rate-limit.test.ts` — +10 tests (3 `checkEmailLockout`, 7
  `recordFailedSignIn`)
- `emails/admin-notification.tsx` — new `email-lockout` variant
- `emails/admin-notification.test.tsx` — snapshot test added
- `emails/__snapshots__/admin-notification.test.tsx.snap` —
  snapshot written
- `lib/admin-email.ts` — `email-lockout` subject case

**Step 5 — wire Turnstile + lockout into auth pages (commit
`261b009`):**

- `package.json` + `pnpm-lock.yaml` — added
  `@marsidev/react-turnstile@1.5.2`
- `components/auth/TurnstileWidget.tsx` (new) — client widget,
  no-ops when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset
- `app/(auth)/sign-up/page.tsx` — widget mounted before submit
- `app/(auth)/sign-up/actions.ts` — Turnstile verify +
  `captchaToken` forwarded to `supabase.auth.signUp`
- `app/(auth)/sign-up/actions.test.ts` — 2 integration tests
- `app/(auth)/sign-in/page.tsx` — widget mounted before submit
- `app/(auth)/sign-in/actions.ts` — Turnstile verify + per-email
  lockout check + `captchaToken` to `signInWithPassword` +
  `recordFailedSignIn(email, ip)` on auth error
- `app/(auth)/forgot-password/page.tsx` — widget mounted before
  submit
- `app/(auth)/forgot-password/actions.ts` — Turnstile verify +
  `captchaToken` to `resetPasswordForEmail`

**Step 6 — security docs (commit `afb0917`):**

- `docs/security/auth-hardening.md` (new) — 8 sections (threat
  model, layered defense, Vercel WAF deferral, three runbooks,
  CAPTCHA accessibility, env-var inventory)
- `docs/security/rls-audit.md` — cross-link added at the top

**Step 7 — production smoke (commits `5695db3` fix, then this
close-out):**

- Pushed Steps 1–6 to origin/master; Vercel auto-deployed.
- Ran all six smoke cases against production — **all passed**:
  1. Turnstile blocks empty submit on `/sign-up`
  2. Sign-up + email confirmation happy path
  3. Per-IP rate limit (M5 limiter still firing)
  4. Per-email lockout cross-IP (verified `rl:email-lock:` key in
     Upstash + one admin `email-lockout` email)
  5. Forgot password + `/reset-password` has no widget
  6. Manual lockout clearance via the Upstash runbook
- **Bug found + fixed (`5695db3`):** the single-use Turnstile token
  was redeemed twice (our `siteverify` + Supabase's `captchaToken`),
  so GoTrue rejected every real submission with "request
  disallowed". Fix: Supabase is the sole verifier; `lib/turnstile.ts`
  reduced to `checkTurnstilePresent` + `isCaptchaRejection`. ADR 0003
  + `docs/decisions/0003-supabase-sole-turnstile-verifier.md`.

## In progress

Nothing. M6 is complete and shipped.

## Not started

Nothing — all seven steps done.

## Decisions made this session

1. **Spec runbook-path fix.** `docs/specs/M6.md:137-138`
   redirected from `docs/admin-runbook.md` (never existed) to
   the runbook section of `docs/security/auth-hardening.md`.
   Keeps all M6 security-doc surface in one self-contained file.
   User-locked option (b) at session start.

2. **`verifyTurnstileToken` signature.** Plan said one-arg
   `(token)`; implementation takes `(token, ip)`. Caller passes
   IP from `getClientIdentifier()`. Matches existing
   `checkRateLimit(identifier, action)` convention and keeps the
   helper free of an implicit `next/headers` dependency.

3. **Lockout storage semantics.** Fixed-window-from-first-failure
   (TTL set on count=1 only), not TTL-reset-per-increment as the
   plan text suggested. TTL-reset would over-collapse slow-drip
   failures into a lockout — punishing a forgetful caregiver who
   mistypes once every 14 minutes for an hour. Spec said
   "sliding window"; the implementation is the spec's intent
   even though the plan text drafted otherwise.

4. **Email normalization is lowercase + trim only.** Different
   IPs hitting the same email collide as expected. Gmail-style
   dot/plus folding NOT applied — Supabase Auth treats `a@x` and
   `a+b@x` as distinct accounts, so we mirror that.

5. **`recordFailedSignIn(email, ip)`** takes IP as a parameter
   rather than calling `getClientIdentifier()` internally. Same
   reasoning as #2 — convention match, no implicit dependency.

6. **Constants:** `EMAIL_LOCKOUT_THRESHOLD = 5`,
   `EMAIL_FAIL_WINDOW_SECONDS = 900`,
   `EMAIL_LOCKOUT_DURATION_SECONDS = 900`. Per spec.

7. **Auth-action sequencing locked at:** Turnstile verify →
   per-IP limiter → per-email lockout (sign-in only) → Zod parse
   → Supabase call. Turnstile first so attackers can't burn the
   per-IP quota submitting empty forms with bogus tokens.

8. **Atomic `INCR` + count-equality threshold check** makes
   lockout-set and admin-notify exactly-once per lockout event.
   Same pattern as M5's rate-limit-breach notification at
   `lib/rate-limit.ts:106-112`.

9. **Steps 3 and 4 landed together** because TypeScript
   exhaustiveness on `AdminNotificationKind` required the
   `email-lockout` variant before rate-limit code could call
   `sendAdminNotification` with the new kind. The plan had them
   as separate steps with a pause between; the implementation
   merged them and pause moved to after-Step-4.

10. **Test-count deviations from plan:** 8 Turnstile tests vs
    plan's 6 (added empty-token short-circuit + HTTP-5xx
    coverage); 10 rate-limit lockout tests vs plan's 9 (added
    dedicated "TTL set only once per window" assertion). Both
    deviations cover code paths the plan didn't enumerate.

11. **Supabase is the sole Turnstile verifier (2026-05-24, ADR
    0003).** The smoke surfaced a double-verification bug: a
    single-use token can't be redeemed by both our `siteverify`
    call and Supabase's `captchaToken`. Resolved by making
    Supabase the only verifier; `lib/turnstile.ts` keeps just a
    presence check + a captcha-error mapper. Also: a captcha
    rejection no longer counts toward the per-email lockout
    (sign-in) and now surfaces instead of being collapsed into
    "sent" (forgot-password).

## Known issues / TODOs

- **E2E Turnstile bypass is retired (M7-prep follow-up).** The
  planned `TURNSTILE_TEST_BYPASS_KEY` + sentinel-token path can't
  pass GoTrue under the sole-verifier model (ADR 0003). The
  Playwright sign-up smoke needs a different approach — a
  preview-only Supabase project with CAPTCHA off, or Cloudflare
  always-pass test keys. The `TURNSTILE_TEST_BYPASS_KEY` env var
  set in Vercel Preview is now inert; remove it or repurpose it
  when the E2E path is rebuilt. No code TODO/FIXME comments left.

## Exact next step

**M6 complete.** Auth hardening shipped to production and smoke-
verified end-to-end. Next milestone (M7) starts with a fresh
pre-flight spec at `docs/specs/M7.md` per the CLAUDE.md
milestone-spec convention. The retired E2E bypass above is the
natural first M7-prep item.
