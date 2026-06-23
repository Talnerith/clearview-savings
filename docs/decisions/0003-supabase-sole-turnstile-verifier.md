# 0003 — Supabase Auth is the sole Turnstile verifier

## Context

M6 (auth hardening, see `docs/specs/M6.md`) added Cloudflare Turnstile
to sign-up, sign-in, and forgot-password. The implementation ended up
verifying each submitted Turnstile token **twice**: first in a
server-side helper (`lib/turnstile.ts`) that POSTed the token to
Cloudflare's `siteverify`, then again by forwarding the same token to
Supabase Auth via the `captchaToken` option (Supabase's "Bot and Abuse
Protection → CAPTCHA" toggle is on, so GoTrue independently calls
`siteverify`).

A Turnstile token is **single-use**. The first redemption succeeds; the
second returns `timeout-or-duplicate`, so GoTrue rejected every real
production submission with `captcha protection: request disallowed
(...)`. The bug was invisible to the test suite and local dev because
`verifyTurnstileToken` bypassed when `NODE_ENV !== "production"` and the
integration test mocked it — only the live Cloudflare API exercises both
real redemptions. The M6 production smoke test surfaced it: a solved
widget ("Success!") still failed account creation with "disallowed."

The M6 spec is internally inconsistent on this point — it asks both for
Supabase-side verification via `captchaToken` (toggle on) *and* for a
standalone server-side verifier. The two cannot coexist on one token.

## Decision

Supabase Auth is the **sole verifier** of the Turnstile token. We pass
the token to Supabase via `captchaToken` and let GoTrue redeem it. We
do **not** call Cloudflare `siteverify` ourselves. `lib/turnstile.ts`
is reduced to two pure helpers: `checkTurnstilePresent` (a presence
check, so an auth action can short-circuit with the calm inline message
before reaching Supabase when no token was submitted) and
`isCaptchaRejection` (maps GoTrue's raw "request disallowed" error to
the calm "Please verify and try again." message). The Supabase dashboard
CAPTCHA toggle stays **on**.

## Alternatives considered

- **We verify in `lib/turnstile.ts`, drop `captchaToken`, turn the
  Supabase toggle off.** Rejected: deviates further from the spec
  (which centers `captchaToken`), removes Supabase's auth-layer abuse
  signal, and makes our hand-rolled verifier the single point of
  failure. Its only upside was preserving the Step 2 code, which is not
  a reason to keep redundant verification.
- **Pass a Cloudflare `idempotency_key` so the token can be redeemed
  twice.** Rejected: idempotent re-validation only works for our own
  repeated `siteverify` calls. We cannot inject an idempotency key into
  GoTrue's internal verification, so the double-spend against Supabase
  remains.
- **Keep both verifiers and fetch two tokens.** Rejected: the widget
  issues one token per solve; a two-token flow would mean two widgets or
  a re-render dance, friction with no security gain.

## Consequences

**Good:**

- Production auth works — one redemption, one verifier.
- One source of truth for captcha verification (GoTrue), battle-tested
  and kept current by Supabase.
- The spec's two acceptance criteria still hold: "Supabase call not
  reached on a missing token" (via the presence check) and "token
  forwarded via `captchaToken`, toggle on."
- Less code: the `siteverify` fetch, its closed-fail/outage handling,
  and the bulk of `lib/turnstile.test.ts` are gone.

**Costs / commitments:**

- We no longer control the captcha failure UX directly — we depend on
  GoTrue's error message containing "captcha", which `isCaptchaRejection`
  matches to render the calm message. If Supabase changes that wording,
  the mapping must be updated (covered by a unit test).
- The closed-fail-on-Cloudflare-outage behavior now lives in GoTrue, not
  our code. A Cloudflare outage still fails closed (Supabase rejects),
  matching the spec's risk framing; the manual fallback (disable the
  Supabase toggle during a multi-hour outage) is unchanged and already
  documented in `docs/security/auth-hardening.md`.
- **The planned E2E preview bypass (`TURNSTILE_TEST_BYPASS_KEY` +
  sentinel token) no longer works through Supabase** — GoTrue would
  reject the sentinel as an invalid token. The Playwright sign-up smoke
  cannot pass a fake token under this model. Resolving the E2E path
  (a preview-only Supabase project with captcha off, or Cloudflare
  always-pass test keys) is deferred follow-up; it does not block the
  manual M6 production smoke.

## Date

2026-05-24
