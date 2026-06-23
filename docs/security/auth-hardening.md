# Auth hardening — M6

> See also: [`docs/security/rls-audit.md`](./rls-audit.md) for the
> data-layer authorization model. This document covers the protection
> stack in front of the auth endpoints; `rls-audit.md` covers what
> happens once a request is past authentication.

Authored: 2026-05-20. The protection stack documented here landed in
M6 on top of the per-IP rate limiter and admin-notification pipeline
from M5. Updated 2026-06-05 (M7): the optional TOTP second factor is
documented as Layer 6 below, with its own lost-device runbook.

The layers above are all *pre-authentication* — they shed abusive
traffic before a password is ever checked. M7 adds the first
*post-authentication* layer: even a correct password no longer reaches
the dashboard for a caregiver who has opted into MFA.

## Threat model

The threats this document addresses, and what each is:

1. **Credential stuffing.** An attacker has obtained an email +
   password pair from a third-party breach (HaveIBeenPwned style)
   and tries it against our sign-in endpoint. Cheap, automated, runs
   from a single IP or a small set of IPs.
2. **Distributed credential stuffing.** Same as #1 but the attacker
   rotates source IPs (residential proxy pool, botnet) so per-IP
   rate-limiting can't see the pattern. Targets one known email at
   low volume per IP, sustained over time.
3. **Brute-force password guessing.** An attacker knows a caregiver's
   email and tries common passwords. Same shape as #1 / #2 depending
   on whether they're rotating IPs.
4. **Automated sign-up spam.** A bot creates many caregiver accounts
   to consume free-tier resources, pollute the admin notification
   inbox, or use the verified emails as a launching pad for other
   abuse.
5. **Password-reset abuse.** A bot triggers reset emails to many
   addresses (denial-of-inbox on the legitimate caregiver, sometimes
   a precursor to social engineering).

Out of scope here:

- **DDoS at IP-flood scale** — handled at the edge by Vercel's
  free-tier DDoS mitigation. Not a per-application concern.
- **Account takeover via session theft** — covered by Supabase's
  refresh-token rotation; revisited when MFA / WebAuthn lands.
- **Patient-route abuse** — the patient URL is a 122-bit UUID
  capability with no auth surface to attack. Brute-forcing the UUID
  is computationally infeasible, so rate-limiting the patient route
  buys nothing.
- **Real-banking-impersonation legal threat** — handled by the
  footer-disclosure rule in `CLAUDE.md` and ADR 0002, not here.

## Layered defense

A request hitting `/sign-up`, `/sign-in`, or `/forgot-password`
passes through these layers, top to bottom. Earlier layers are
cheaper and shed obviously-bad traffic before later, more expensive
layers see it.

### Layer 1 — Vercel Edge (free tier)

Generic DDoS mitigation, TCP / TLS handling, edge caching of static
assets. We do not configure this; Vercel provides it as part of any
plan. **Stops:** volumetric attacks, malformed packets, obvious
abuse fingerprints Vercel's network sees across all hosted apps.

### Layer 2 — per-IP rate limiter (M5)

Source: `lib/rate-limit.ts:73-93`. Implementation: Upstash Redis +
`@upstash/ratelimit` sliding window. Limit: **5 attempts per IP per
minute** on each of `signUp`, `signIn`, `forgotPassword`. Fails
open if Upstash is unreachable (returns `{ allowed: true }`) so a
provider outage doesn't lock every caregiver out. Bypasses entirely
when `NODE_ENV !== "production"` so local dev and CI never block on
the limiter.

**Stops:** single-IP credential stuffing, single-IP brute-force,
single-IP sign-up spam. Does **not** stop the same attacker rotating
across many IPs — that's what Layer 3 closes.

When the limiter blocks an attempt 15 times in a 5-minute window
from one IP, an `rate-limit-breach` admin notification fires. See
the runbook section below for triage.

### Layer 3 — per-email lockout (M6)

Source: `lib/rate-limit.ts:checkEmailLockout` and
`recordFailedSignIn`. Implementation: Upstash Redis with a counter
key (`rl:email-fails:<lc-email>`, 15-min TTL) and a presence-only
lock key (`rl:email-lock:<lc-email>`, 15-min TTL).

**Trigger:** 5 failed `signInWithPassword` calls to the same email
within a 15-minute window — counted across all source IPs.
**Effect:** the email is locked for 15 minutes. Subsequent sign-in
attempts to that address return the same calm "please wait a moment
and try again" message regardless of source IP, until the lockout
expires.

**Stops:** distributed credential stuffing against a known email
(threat #2). An attacker rotating across 5 IPs to submit one wrong
password from each still trips the per-email counter on attempt 5
and gets locked out from attempt 6 onward.

**Cost of the lockout to legitimate users:** if a caregiver
mistypes their password 5 times in 15 minutes, they're locked out
for 15 minutes. The cooldown is short enough that "go grab a glass
of water" works as the recovery path. A stuck lockout — legitimate
caregiver locked by an attacker probing their address — can be
cleared by admin via the runbook below.

When a lockout triggers, an `email-lockout` admin notification
fires exactly once per lockout event (not once per blocked attempt
during the lockout window). The locked-out account holder is **not**
notified by email — sending an alert to the address being attacked
would create an attacker-driven spam vector where repeated lockouts
fill the victim's inbox.

### Layer 4 — Cloudflare Turnstile CAPTCHA (M6)

Source: `lib/turnstile.ts`. Server-side verification of a token the
widget mints on the client. The verified token is forwarded to
Supabase Auth via the `captchaToken` option on `signUp`,
`signInWithPassword`, and `resetPasswordForEmail`, giving Supabase
Auth a second opportunity to reject the request if their backend
disagrees.

**Mode:** Managed (Cloudflare auto-selects challenge difficulty per
request). Most legitimate caregivers see no interaction — the
widget passes silently and the form submits normally. When
Cloudflare's risk signals are elevated, a visual or audio challenge
is presented.

**Closed-fail by design:**
- Missing `TURNSTILE_SECRET_KEY` in production → return
  `{ ok: false, reason: "captcha_misconfigured" }`, Sentry-log.
  A misconfigured production cannot silently accept un-CAPTCHA-
  verified submissions.
- Cloudflare API unreachable (network error or HTTP 5xx) → return
  `{ ok: false, reason: "captcha_unavailable" }`, Sentry-log.
- The user-visible failure mode in both cases is "calm inline error,
  try again later," not "site broken."

**Bypasses (return ok without contacting Cloudflare):**
- `NODE_ENV !== "production"` — dev and CI.
- `TURNSTILE_TEST_BYPASS_KEY` env var set **and** submitted token
  equals that value — the Playwright preview-deploy path. The env
  var is set only in Vercel Preview, never Production, so the
  sentinel is meaningless in prod even if it leaks.

**Stops:** all bot-driven attack classes (#1, #2, #4, #5) that
can't solve the challenge. A human-driven, slow-tempo credential
stuffing attack can still solve Turnstile challenges manually —
that's where Layers 2 and 3 are doing the real work.

### Layer 5 — Supabase Auth internal limits

Supabase Auth applies its own rate-limiting at the auth-provider
layer (per-email signup throttling, per-IP recovery throttling) and
when CAPTCHA is enabled at the project level, validates the
`captchaToken` Layer 4 forwards. We don't configure these directly
beyond turning CAPTCHA on; they exist as a final backstop.

### Layer 6 — TOTP second factor (M7)

The first **post-password** layer. Everything above shapes traffic
*before* a password is validated; Layer 6 sits *after* a correct
`signInWithPassword` and asks "is this really the account holder?"

Source: `lib/auth/aal.ts` (the AAL state helper),
`lib/supabase/middleware.ts` (the route gate),
`lib/auth/current-caregiver.ts` (the server-loader gate),
`app/(auth)/challenge/` (the challenge page + actions),
`app/(caregiver)/caregiver/settings/` (enroll / regenerate / disable).
Factor type: **TOTP** (authenticator app), via Supabase Auth's native
`auth.mfa.enroll → challenge → verify`. Recovery codes are ours
(`mfa_recovery_codes` table + `lib/mfa/recovery-codes.ts`) because
Supabase TOTP has no native recovery-code concept.

**Opt-in.** A caregiver with no verified factor signs in exactly as in
M6 — their session is AAL1 and AAL1 is sufficient for them. Enabling
MFA is a deliberate choice in `/caregiver/settings`. There is no
org-wide *require-MFA* enforcement in M7 (an M8 candidate).

**Enforcement (AAL2).** Once a caregiver has a verified factor:
- A successful password step yields an **AAL1** session and redirects
  to `/challenge`, not the dashboard.
- A correct TOTP code steps the session up to **AAL2** and lands
  `/caregiver`.
- `/caregiver/*` is gated at **two** layers — `middleware.ts` and the
  `getCurrentCaregiver()` server loader — so an AAL1 session that
  somehow bypasses middleware still can't load caregiver data. (RLS-
  level `aal2` gating is deliberately deferred to M8; route +
  server-action enforcement is the M7 boundary.)
- A password **reset** does not bypass this: the recovery-link session
  is AAL1, so a caregiver with a factor is still challenged after
  resetting their password.

**Stops:** account takeover by a leaked or guessed *password alone*
(the residual after Layers 2–5 — a human-driven slow-tempo attacker who
solves Turnstile and knows the real password). It does **not** address
session-cookie theft (that remains Supabase refresh-token rotation's
job) and it is not a patient-route concern (patients have no auth
surface — UUID capability only; reaffirmed, never MFA'd).

**Failed-code limiting:** Supabase Auth's built-in MFA-verify rate
limit. No custom per-account limiter in M7 — a 6-digit code under those
limits is infeasible to brute-force in the verify window.

**Accessibility.** Authenticator apps are a real hurdle for the older
caregiver audience (the same concern M6 flagged for CAPTCHA).
Mitigations baked into the design: MFA is opt-in (never forced on the
unprepared), enrollment shows a copyable manual secret alongside the QR,
recovery codes are printable and shown plainly, and the
`support@clearviewsavings.com` + admin-runbook path (below) is the
backstop when a caregiver is fully locked out.

## Vercel WAF — deferred, Pro tier required

A configurable Web Application Firewall (custom rules, geo-blocking,
bot-management rules, per-route rate-limit overrides) is available
on Vercel Pro. M6 explicitly stays on Hobby. The decision rationale:

- The four-layer stack above is sufficient defense for a beta-stage
  product with no known active abuse traffic.
- Pro is a recurring monthly cost we don't have spend justification
  for today.
- Vercel's free-tier dashboard still exposes manual per-IP blocking
  if a sustained abusive IP shows up in our admin notifications —
  see the runbook below.

**Revisit when:** real abuse traffic appears in Sentry or in
admin-notification volume (more than a handful of `rate-limit-breach`
notifications per week) and per-IP blocking from the Hobby dashboard
becomes a recurring chore.

## Runbook — clearing a stuck email lockout

Use case: a legitimate caregiver has been locked out by an attacker
probing their address (or has hit the 5-failed-attempts limit in 15
minutes themselves and is unwilling to wait the cooldown). The
cooldown is short by design, so the default answer is "wait" — but
when admin intervention is warranted, the steps:

1. Open the Upstash console → https://console.upstash.com → log in
2. Select the `clearview-savings-prod` database
3. **Data Browser** tab → search for the key
   `rl:email-lock:<lowercase-trimmed-email>`. Example: a caregiver
   `Caregiver@Example.com` would have key
   `rl:email-lock:caregiver@example.com`.
4. Delete the key. The caregiver can now sign in immediately.
5. Optional: also delete `rl:email-fails:<lc-email>` to reset the
   in-window failure counter. Without this step, a subsequent wrong
   password could re-trigger the lockout sooner than 15 min.

If the caregiver isn't sure whether they were locked out by attacker
activity or by their own typos, the admin should also check the
`email-lockout` notification email for the "Most-recent IP" field
and compare against the caregiver's known geo.

## Runbook — interpreting rate-limit-breach notifications

Triggered: 15 blocked attempts from one IP on one endpoint within a
5-minute window (`lib/rate-limit.ts:14`).

Triage steps:

1. Read the IP and endpoint from the admin email. The IP is the
   `x-forwarded-for` leftmost entry from when the limiter blocked
   the 15th attempt.
2. Check whether the IP is geo-coherent with any known caregiver.
   `whois` / `ipinfo.io` is usually enough.
3. Cross-reference with recent Sentry events from the same window
   — if the IP also generated 5xx errors, that's a stronger abuse
   signal than just rate-limit blocks.
4. If the IP is clearly abusive (datacenter range, no legitimate
   caregiver association, sustained pattern across multiple
   endpoints): block via the Vercel dashboard.
   - Vercel project → **Firewall** → **Rules** → **Add Rule** →
     Match IP equals `<ip>` → Action: Block. Hobby tier supports
     manual block rules (Pro is required only for the WAF custom-
     condition engine, not for single-IP blocks).
5. If the IP is plausibly a real caregiver (residential range, geo
   matches), do nothing. The per-IP limiter will recover them in
   the next minute and the breach notification was informational.

## Runbook — interpreting email-lockout notifications

Triggered: 5 failed `signInWithPassword` calls to one email within a
15-minute window (`lib/rate-limit.ts:EMAIL_LOCKOUT_THRESHOLD`).

Triage steps:

1. Read the email, most-recent IP, and attempt count from the
   admin notification.
2. Recognize the email — is it a caregiver you know? If not, the
   lockout is probably probing activity. Default response: nothing.
   The cooldown is the response.
3. If the email **is** a known caregiver and the most-recent IP is
   geo-incoherent with their known location: probable attacker
   probing. Leave the lockout in place; the caregiver can wait or
   contact `support@clearviewsavings.com`.
4. If the email is a known caregiver and the IP looks like theirs
   (residential range, matching geo): they probably typo'd their
   password 5 times. The cooldown is the right answer; intervene
   only if they explicitly escalate.
5. Manual lockout-clear: only when a known caregiver has escalated
   and the 15-min cooldown hasn't expired yet. Follow the
   "Clearing a stuck email lockout" runbook above.

## Runbook — caregiver lost their MFA device

Two tiers, depending on whether the caregiver still has their recovery
codes.

**Tier 1 — they have a recovery code (self-serve, no admin needed).**
On the `/challenge` screen the caregiver clicks "Use a recovery code
instead" and enters one of the codes shown at enrollment. This consumes
the code (single-use), removes the lost TOTP factor via the privileged
admin path, signs them in at AAL1, and lands `/caregiver?reenroll=1`
with a calm banner prompting re-enrollment. No support ticket. A
recovery code cannot itself mint an AAL2 session — Supabase only grants
AAL2 from a TOTP verify — so this is an honest unenroll-then-re-enroll,
not a shortcut.

**Tier 2 — they lost the device *and* the recovery codes (admin
backstop).** The caregiver emails `support@clearviewsavings.com`. After
confirming identity out-of-band, the admin removes the factor one of two
ways:

1. **Supabase dashboard** — Authentication → **Users** → find the
   caregiver by email → open their detail → remove the listed MFA
   factor.
2. **One-off privileged script** — using `SUPABASE_SECRET_KEY`, call
   `auth.admin.mfa.deleteFactor({ id: factorId, userId })` — the *same*
   call `lib/supabase/admin.ts` makes for the Tier-1 self-serve path.
   List the user's factors first (`auth.admin.mfa.listFactors({ userId })`
   or read from the dashboard) to get `factorId`.

After removal the caregiver signs in at **AAL1** and is prompted to
re-enroll a fresh factor in settings. **Patient access is unaffected
throughout** — patient views are UUID-addressed and have no auth
surface, so a locked-out caregiver never interrupts the patient's view
of their accounts.

> **Note on the privileged key.** `SUPABASE_SECRET_KEY` grants full
> Admin Auth privileges. `lib/supabase/admin.ts` is the *only*
> request-reachable call site (`import "server-only"`, one consumer: the
> Tier-1 unenroll path). Any one-off Tier-2 script must run server-side
> with the key from a trusted environment — never ship it to the
> client. See `rls-audit.md` for the privileged-call-site inventory.

## CAPTCHA accessibility fallback

Many caregivers using Clearview Savings are themselves older or
have motor / visual challenges. Turnstile's design accommodates
this:

- **Managed mode** (what we use) presents an invisible challenge to
  the majority of legitimate users — the form submits with no
  interaction.
- When Cloudflare's risk signals demand a visible challenge, the
  widget falls back to a single-click "I'm not a robot" interaction
  rather than a "click the motorcycles" puzzle.
- The widget supports an audio challenge for visually-impaired
  users.

**Escalation path:** a caregiver who cannot clear the challenge for
any reason can email `support@clearviewsavings.com`. Admin's
workaround during a Cloudflare outage is to temporarily disable the
Supabase Auth CAPTCHA toggle (Supabase dashboard → Authentication →
Settings → Bot and Abuse Protection → Enable CAPTCHA protection
off). This bypasses Layer 4 but leaves Layers 2 and 3 in place,
which is an acceptable degraded posture for a multi-hour outage.

## Env-var inventory

| Variable | Where set | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel Production / Preview / dev, `.env.local` | Site key the widget mounts with. Public by design (the `NEXT_PUBLIC_` prefix is required for the React component to read it). |
| `TURNSTILE_SECRET_KEY` | Vercel Production / Preview / dev, `.env.local`; **also** pasted into the Supabase Auth dashboard (CAPTCHA secret field) | Server-only secret. Used by `lib/turnstile.ts` to verify tokens against Cloudflare's siteverify endpoint, and by Supabase Auth to do its own verification when the `captchaToken` is forwarded. |
| `TURNSTILE_TEST_BYPASS_KEY` | Vercel **Preview only**; optional in dev; **never set in Production** | Sentinel token value for the Playwright preview-deploy E2E path. When set, `lib/turnstile.ts` accepts a token exactly equal to this value without contacting Cloudflare. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Vercel Production, `.env.local` | Required for the per-IP limiter (Layer 2) and the per-email lockout (Layer 3) to engage. If either is missing, both layers fail open — closed-fail would lock everyone out on misconfig. |
| `ADMIN_EMAIL` | Vercel Production, `.env.local` | Recipient for `rate-limit-breach`, `email-lockout`, and `mfa-disabled` notifications. If unset, the notifications are silently dropped (dev convenience). |
| `SUPABASE_SECRET_KEY` | Vercel Production / Preview, `.env.local` | Server-only Admin Auth key. Used by `lib/supabase/admin.ts` (the sole request-reachable privileged call site, `server-only`) for `auth.admin.mfa.deleteFactor` on the lost-device recovery path, and by the Tier-2 admin runbook script. Never exposed to the client. |
