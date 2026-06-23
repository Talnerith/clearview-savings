# Milestone 5 — Progress (Step 9 of 10 complete; M5 functionally shippable; Step 10 docs polish deferred)

Last touched 2026-05-19. Built on top of `m4-complete` (`24bbb25`)
plus the post-M4 chore `4b0cc54` (B4A residue rename + footer rule
sharpening). Frozen spec is `docs/specs/M5.md`; build plan is
`docs/milestones/M5.md`. This file tracks state against that plan
and records implementation-time decisions not in the plan doc.

**Status:** M5 is functionally complete. Sub-step 9.6 (production
smoke test) passed end-to-end after a series of polish + leak fixes
documented below. The remaining Step 10 work is documentation-only
(`docs/deployment.md`, `docs/admin-runbook.md`, launch-ready
`README.md`, patient-vocab final audit) — deferred at user request
to start M6 prep first. The site is live, smoke-passing, and safe to
share; the deferred docs do not block external traffic.

`pnpm typecheck && pnpm lint && pnpm test --run` green at session
close: **152 tests passing across 14 files** in the default lane —
unchanged count this session. All session work was either UI polish
(brand-asset + email lockup, marketing-nav, legal-links nav,
patient-side disclosure routing), code-comment updates, or new
documentation; no new test files added. Three email snapshot files
regenerated to reflect the lockup change.

Gated lane (`RUN_REAL_POSTGRES_TESTS=1 pnpm test --run`) adds **42
real-Postgres tests** at `lib/security/rls-cross-tenant.real.test.ts`
via `@testcontainers/postgresql`. Unchanged this session.

`pnpm build` clean at session close. New route this session:
`/patient/[id]/about` (patient-side regulatory disclosure page that
returns only to `/patient/[id]`). New component:
`components/LegalLinksNav.tsx`. New asset:
`public/branding/clearview-savings-logo.svg` (full lockup viewBox
for transactional email headers).

GitHub repo: `github.com/Talnerith/clearview-savings` (private,
`master` pushed and tracking `origin/master`). Vercel deploy live
at **both** `https://clearviewsavings.com/` (primary) and
`https://www.clearviewsavings.com/` (307-redirects to apex). DNS
propagated, SSL certs auto-issued by Vercel via Let's Encrypt.
Supabase Auth Hook and Sentry webhook point at the prod apex URL.
Production smoke (9.6) passed: sign-up + email confirmation +
caregiver dashboard + admin email + forgot/reset password + 6-bad-
attempt rate-limit + 15-attempt breach-notification. Patient-side
disclosure leak (patient could click Learn more → /about → Caregiver
dashboard button → /caregiver) discovered and closed during smoke.

## At a glance

| Step | Description                                                  | Status      |
| ---- | ------------------------------------------------------------ | ----------- |
| 1    | Brand assets + `<FooterDisclosure />` on every page          | ✓ done      |
| 2    | Resend integration (`lib/email.ts` + React Email templates)  | ✓ done      |
| 3    | Email confirmation flow + Supabase Auth Hook webhook         | ✓ done      |
| 4    | Public landing page at `/` + legal pages                     | ✓ done      |
| 5    | Sentry + Vercel Analytics                                    | ✓ done      |
| 6    | Admin notifications (`lib/admin-email.ts` + `/admin` gate)   | ✓ done      |
| 7    | Rate limiting on auth endpoints (Upstash)                    | ✓ done      |
| 8    | RLS audit + cross-tenant integration test + fixes            | ✓ done      |
| 9    | Vercel deployment + DNS                                      | ✓ done      |
| 10   | Documentation finalization + README + green check            | deferred    |

## Done

### Pre-M5 chore (commit `4b0cc54`)

- `lib/db/index.ts` — renamed `__b4aPg` → `__clearviewPg`.
- `scripts/apply-migration.ts` — kept `_b4a_applied_migrations`
  table (load-bearing in prod); added explanatory comment.
- `CLAUDE.md` — sharpened Branding/footer-disclosure rule with
  Canadian-regulatory framing and concrete page scope.

### Step 1 — Brand assets + `<FooterDisclosure />` (commit `28f462e`)

Brandmark (cropped sun+wave SVG, height-fixed/width-auto, three
size variants), root-layout-mounted `<FooterDisclosure />`,
PDF-side icon module (`lib/branding-pdf.tsx`) hardcoding the full
627×627 viewBox for the full lockup on checks and workbooks,
favicon via Next.js `app/icon.svg`. Currency-aware fake-address
map on check letterhead.

### Step 2 — Resend integration (commit `290577e`)

`lib/email.ts` (Resend SDK wrapper, From/Reply-To fixed,
RESEND_API_KEY-or-throw). React Email templates in `emails/`:
`layout.tsx` (shared chrome with brand `<Img>` + typographic
fallback + footer disclosure), `confirm-email.tsx`,
`reset-password.tsx`, `admin-notification.tsx` (discriminated
union over four kinds). Snapshot + content tests per template.
`vitest.config.ts` got `esbuild.jsx: "automatic"` so the first
`.test.tsx` files render without per-file React imports.

### Step 3 — Email confirmation flow + Auth Hook webhook (commits `1fb915a`, `8fbb411`)

Locked-decision-Option-B: Supabase's "Send Email Hook" fires for
every auth email event, our webhook verifies the HMAC, dispatches
on `email_action_type`, and sends via Resend with our React
templates. No SMTP, no HTML pasted into the dashboard.

End-to-end verified twice during the session: throwaway address →
ngrok-tunneled sign-up → Resend-delivered confirmation email →
`/auth/callback?token_hash=…` → `/caregiver`. The Resend domain
`clearviewsavings.com` was verified mid-session (SPF + DKIM + MX
all green). DMARC TXT added on `_dmarc`:
`v=DMARC1; p=none; rua=mailto:dmarc-reports@clearviewsavings.com`.

### Step 4 — Public landing page + legal pages (commit `a36b5c8`)

New `(marketing)` route group hosting the public unauthenticated
surface. Footer disclosure inherits from the root layout
unchanged. Landing page with hero CTAs, "What this is" / "How it
works" / "Why families use it" sections; legal pages /about,
/privacy, /terms, /security each opening with the verbatim
disclosure callout.

### Step 5 — Sentry + Vercel Analytics (commit `50ac1bc`)

`instrumentation-client.ts` + `instrumentation.ts` (v10
conventions), `app/global-error.tsx` outermost boundary,
`app/debug-sentry/route.ts` synthetic-error endpoint with
production-404 gate + unit test. Tunneled at `/monitoring` so
ad-blockers don't strip Sentry traffic. Source-map upload gated
on `SENTRY_AUTH_TOKEN` (CI/Vercel only). `<Analytics />` from
`@vercel/analytics/next` mounted in `<body>`.

### Step 6 — Admin notifications + `/admin` gate (commit `0078943`)

Wires the four admin notification kinds locked at M5 freeze and
gates `/admin/*` against `ADMIN_EMAIL`. New files:
`lib/admin-email.ts`, `app/api/sentry-webhook/route.ts`,
`app/api/cron/daily-digest/route.ts`, `vercel.json`,
`app/admin/page.tsx`. Edited `lib/auth/current-caregiver.ts`
(one-shot new-caregiver notification), `lib/supabase/middleware.ts`
(404 admin gate), `.env.example`.

### Step 7 — Rate limiting on auth endpoints (commit `8946663`)

5 attempts/minute/IP via Upstash sliding-window limiter on
sign-up, sign-in, forgot-password. Falls open in non-production
and when Upstash env is missing. Step 7 grew to include the
`/forgot-password` and `/reset-password` pages (Step 3 omission;
user approved the scope expansion mid-session). New:
`lib/rate-limit.ts`, `lib/rate-limit.test.ts`,
`app/(auth)/forgot-password/{page.tsx,actions.ts}`,
`app/(auth)/reset-password/{page.tsx,actions.ts}`,
`vitest.server-only-shim.ts`.

### Step 8 — RLS audit + cross-tenant integration test (commit `e95bd09`)

The audit walks all seven tables (`caregivers`, `patients`,
`accounts`, `transactions`, `scheduled_deposits`, `deposit_codes`,
`audit_log`) against `supabase/policies.sql`. One finding: the
`audit_log` table had no RLS policy and RLS wasn't enabled on it.
Fixed in the same milestone — `audit_log_owner` scoped by direct
caregiver_id is now in `policies.sql` and the cross-tenant tests
exercise it.

**New files:**

- `supabase/policies.sql` (edited) — added `alter table public.
  audit_log enable row level security` plus the `audit_log_owner`
  policy. The new policy uses a direct caregiver_id scope (no
  patient join) — matches how `lib/audit-log.ts` already stamps
  the column at insert.
- `docs/security/rls-audit.md` — per-table policy verdict matrix,
  service-role / privileged-DB call-site walkthrough, and a frank
  "Production enforcement model" section spelling out that the
  app's `lib/db` connection uses the `postgres` superuser via the
  session pooler, which bypasses RLS. Authorization is enforced
  application-side via `getCurrentCaregiver()` /
  `getPatientForCaregiver()` + scoped queries. RLS is durable
  defense-in-depth for any future PostgREST / Supabase-JS code
  path; the new integration tests verify it'd hold under that
  path.
- `lib/security/rls-cross-tenant.test.ts` — 28 emulated tests.
  pg-mem does not honor RLS natively, so this test pins the
  *shape* of each policy's USING clause: for each table, run the
  same WHERE filter the production policy expands to, parameterized
  by caregiver `auth.uid()` value, and assert self-row visible /
  cross-tenant invisible. Catches policy-logic regressions at the
  SQL-shape level. Runs in the default `pnpm test --run` lane.
- `lib/security/rls-cross-tenant.real.test.ts` — 42 real-Postgres
  tests. `@testcontainers/postgresql` spins up postgres:15, the
  test loads drizzle migrations + an `auth.uid()` stub + the
  `authenticated` role + `supabase/policies.sql`, then runs SELECT
  / UPDATE / DELETE / INSERT cross-tenant matrices with `set local
  role authenticated; select set_config('request.jwt.claim.sub',
  $1, true)` switching identities per-transaction. Gated by
  `RUN_REAL_POSTGRES_TESTS=1` so CI without Docker still passes.

**Edited files:**

- `package.json`, `pnpm-lock.yaml` — added `@testcontainers/
  postgresql` and `testcontainers` as devDependencies.

### Step 9 — Vercel deployment + DNS (all 6 sub-steps)

**9.1 — GitHub repo pushed (no commit; `gh` CLI):**

- `gh repo create clearview-savings --private --source=. --remote=
  origin --push` created the private repo at
  `github.com/Talnerith/clearview-savings` and pushed master.
  `gh auth status` already showed Talnerith authenticated with the
  needed scopes (`repo`, `workflow`); single command, no prompts.

**9.2 — Sentry project provisioned (no commit; secrets only):**

- Sentry org `personal-aae`, project `clearview-savings`
  (Developer plan, free: 5k errors/mo, 7-day retention).
- Four new env vars in `.env.local`: `NEXT_PUBLIC_SENTRY_DSN`,
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. The auth
  token uses Sentry's newer user-level format (`sntryu_` prefix)
  rather than org-level `sntrys_` — see decision #61 for the
  durability trade-off.
- Verified locally: `pnpm dev` + browser hit at
  `localhost:3000/debug-sentry` produced a "Sentry debug —
  synthetic error" event in the Sentry Issues tab within ~10s.
  M5 spec acceptance criterion ("dev-mode hit to `/debug-sentry`
  triggers a captured error in Sentry") now satisfied.

**9.3 — Vercel deploy live (no commit; Vercel project config only):**

- Vercel project imported from `Talnerith/clearview-savings`.
  Framework auto-detected as Next.js; install/build commands
  auto-detected from `pnpm-lock.yaml`.
- 16 env vars added via Vercel UI's "Paste .env" bulk feature,
  applied to all three Vercel environments (Production + Preview
  + Development — decision #63). 8 vars flagged sensitive
  (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `RESEND_API_KEY`,
  `SUPABASE_AUTH_HOOK_SECRET`, `SENTRY_WEBHOOK_SECRET`,
  `CRON_SECRET`, `UPSTASH_REDIS_REST_TOKEN`,
  `SENTRY_AUTH_TOKEN`); 8 left plain (the `NEXT_PUBLIC_*` set,
  Sentry slugs, `ADMIN_EMAIL`, `APP_BASE_URL`).
- `APP_BASE_URL` set in Vercel to `https://clearviewsavings.com`
  (not the dead ngrok URL still in local `.env.local`) — see
  decision #62 for the timing rationale.
- First deploy succeeded. Live at
  `https://clearview-savings.vercel.app/`. Landing page renders;
  `/about`, `/privacy`, `/terms`, `/security` all render with
  the footer disclosure inheriting from the root layout.
- Sentry source-map upload succeeded at build time (no auth-
  token rejection in the build log).
- Auth flow not exercised in the 9.3 smoke — Supabase Auth Hook
  URL still points at the dead dev ngrok tunnel until sub-step
  9.5, so confirmation emails won't fire from the live URL yet.
- Browser console on the Vercel URL shows two known non-issues
  (both noted in Known Issues): `ERR_BLOCKED_BY_CLIENT` on
  `/monitoring` (user's ad-blocker catching the Sentry tunnel)
  and `A listener indicated an asynchronous response...`
  (third-party browser extension noise). Neither originates in
  our code; incognito confirms both disappear.

**9.4 — DNS records + Vercel domain attach (no commit; Namecheap + Vercel config only):**

- Vercel → Settings → Domains: added `clearviewsavings.com` and
  `www.clearviewsavings.com` to the project. Vercel surfaced
  newer values than the plan doc anticipated — apex A record
  value `216.198.79.1` (not the older `76.76.21.21`) and www
  CNAME `e1eb041bb1424ae8.vercel-dns-017.com.` (not the older
  `cname.vercel-dns.com.`). The older values still work but are
  deprecated; the newer ones are part of Vercel's planned IP
  range expansion. See decision #67.
- Namecheap → Advanced DNS:
  - **Deleted:** URL Redirect Record on `@` pointing to
    `http://www.clearviewsavings…`. This was the source of the
    pre-fix apex → www 307 chain and Vercel's "Invalid
    Configuration" badge. Replaced by the apex A record.
  - **Added:** A Record `@` → `216.198.79.1`, TTL Automatic.
  - **Edited:** existing CNAME `www` value updated from the
    older `cname.vercel-dns.com.` to the newer
    `e1eb041bb1424ae8.vercel-dns-017.com.`.
  - **Untouched:** all MX records (`mx1.improvmx.com.` priority
    10, `mx2.improvmx.com.` priority 20 on `@`;
    `feedback-smtp.us-east-1.amazonses.com` priority 10 on
    `send`), all TXT records (`_dmarc`, `resend._domainkey…`,
    `send` SPF). Email infrastructure preserved.
- DNS propagated to Google's resolver (`8.8.8.8`) within minutes
  — verified externally via `nslookup` and `curl -sSI`. SSL
  certs auto-issued by Vercel via Let's Encrypt; HSTS header
  (`Strict-Transport-Security: max-age=63072000`) present on
  both apex and www responses.
- Vercel → Settings → Domains: `clearviewsavings.com` set as
  primary; `www.clearviewsavings.com` configured to redirect to
  apex. Verified externally:
  - `curl -sSI https://clearviewsavings.com/` → `200 OK` from
    Vercel (HTML, ~23 KB, brand-icon preload header present).
  - `curl -sSI https://www.clearviewsavings.com/` → `307
    Temporary Redirect` → `Location: https://clearviewsavings.com/`.
- See decision #64 for the apex-as-primary rationale.

**9.5 — Webhook URL updates (no commit; Supabase + Sentry dashboard config only):**

- **Supabase Auth Hook** (Authentication → Hooks → Send Email
  Hook): URL swapped from the dev ngrok tunnel to
  `https://clearviewsavings.com/api/auth/email-hook`. The
  existing `SUPABASE_AUTH_HOOK_SECRET` value was kept unchanged
  (already in Vercel env + `.env.local`), so no env-var update
  was needed.
- **Sentry Internal Integration** (org Settings → Custom
  Integrations → `clearview-savings-webhook`) created with:
  - Webhook URL: `https://clearviewsavings.com/api/sentry-webhook`
  - **Alert Rule Action: ON** (required — see decision #65)
  - Permissions: `Issue & Event: Read`; all other permissions
    left at `No Access` (minimum-privilege).
  - Webhooks subscription section: all unchecked (using Alert
    Rule Action path, not webhook resource subscriptions).
- **Sentry Project Alert Rule** `Fatal events → admin email`
  created (Projects → clearview-savings → Alerts):
  - Source: alert on all issues in `clearview-savings` project,
    All Environments.
  - WHEN trigger: "A new issue is created".
  - IF filter: "all of these filters match" with "The event's
    level equals fatal".
  - THEN action: "Send a notification via
    clearview-savings-webhook" (the integration). The
    "Select an action" secondary dropdown was left empty —
    Sentry's UI exposes it as an optional secondary, not a
    required sub-action.
  - Action Throttle: "Get notified on every trigger" — fatal
    events are rare and should never be suppressed.
- **Sentry default "Send a notification for high priority issues"
  rule kept enabled** — complementary to the fatal rule
  (Sentry's built-in email path notifying Suggested Assignees →
  Recently Active Members fallback, which resolves to the
  user's Sentry account email on a solo org). See decision #66.
- **Sentry-issued webhook secret match verified 2026-05-18.**
  User confirmed Sentry's displayed Webhook Secret on the
  `clearview-savings-webhook` Internal Integration matches
  `SENTRY_WEBHOOK_SECRET` in Vercel env vars + `.env.local`.
  Handler's HMAC verification at
  `app/api/sentry-webhook/route.ts:55-57` will accept Sentry's
  signed payloads.

### Sub-step 9.6 + post-smoke polish (commits `c9011d0`, `40469cb`, `8b01b7e`, `c6031b0`, `89521b8`, `5143091`, `cbb5230`)

Production smoke completed end-to-end. Five distinct issues
surfaced during the smoke and were fixed in-band; the final
deploy at commit `cbb5230` is the M5-shippable build.

**Smoke flows that passed:**

1. **Primary sign-up + confirmation + dashboard + admin notification.**
   Throwaway email at `tester+test2@example.com` signed up, received
   the Clearview-Savings-branded confirmation email (~2s), clicked
   through to `/caregiver`, admin received `new-caregiver`
   notification at `admin@example.com`.
2. **Forgot/reset password.** `/forgot-password` form submitted,
   Resend-branded recovery email arrived, link landed on
   `/reset-password`, new password set, sign-in with new password
   worked.
3. **Rate-limit 6 attempts.** 5 wrong-password attempts on
   `/sign-in` returned "Invalid credentials"; 6th attempt within
   the 1-min sliding window returned the calm amber "please wait
   a moment and try again." message.
4. **Rate-limit breach 15 attempts.** Continued past 6 to 15
   wrong-password attempts; admin received a `rate-limit-breach`
   notification email with IP + endpoint + attempt count.

**Polish + leak fixes during smoke (chronological):**

5. **Email lockup (commit `c9011d0`).** First smoke showed the
   confirmation email rendering the cropped sun+wave icon plus a
   separate typographic "Clearview Savings" wordmark — visually
   redundant against the brand SVG's in-asset wordmark. Added a
   second public asset `public/branding/clearview-savings-logo.svg`
   reusing the same path data with a wider viewBox showing the
   full lockup (mark + in-SVG wordmark). Email templates now point
   at this and drop the separate `<Text>` wordmark.
6. **Email lockup centering (commit `40469cb`).** The lockup
   rendered visibly left-of-center in Gmail despite the brandRow
   section's `textAlign: center`. Added an explicit
   `display: block; margin: 0 auto` style to the Img — block-
   centering is more durable across email clients than text-align
   centering of inline images.
7. **Caregiver dashboard nav on legal pages (commit `8b01b7e`).**
   Marketing-route header showed Sign in / Create account
   regardless of auth state. A signed-in caregiver who clicked
   "Learn more" in the FooterDisclosure landed on `/about` with
   no obvious path back to the dashboard. Made
   `app/(marketing)/layout.tsx` async, fetched `auth.getUser()`,
   swapped the two unauthenticated buttons for a single
   "Caregiver dashboard" button when signed in.
8. **Legal-links nav across layouts (commit `c6031b0`).** Only
   the landing page exposed all four legal pages; everywhere else
   the disclosure footer's "Learn more" anchor only reached
   `/about`. Extracted `<LegalLinksNav />` and mounted in
   marketing, caregiver, and auth layouts. Patient layout
   deliberately stays clean.
9. **Patient → caregiver leak via marketing nav (commits `89521b8`,
   `5143091`, `cbb5230`).** Smoke uncovered a real cross-mode
   leak: patient on `/patient/[id]` clicks the disclosure's "Learn
   more" → lands on `/about` → marketing layout sees caregiver
   auth in the browser → shows "Caregiver dashboard" button →
   patient clicks → ends up in `/caregiver`. Same path also
   reachable via the marketing-layout brand link, which redirects
   `/` to `/caregiver` for signed-in visitors.

   Tried two cookie-based approaches first
   (`89521b8`, `5143091`), both flawed because cookies are
   browser-wide and blocked the caregiver's own caregiver-side
   tabs whenever the same browser had ever visited a patient
   route in the last 15 minutes. Replaced with the final
   URL-based solution in `cbb5230`:

   - `components/FooterDisclosure.tsx` became a client component
     using `usePathname()` to route its "Learn more" target by
     current URL. On `/patient/[id]/*` it links to a new
     patient-side disclosure page at `/patient/[id]/about`;
     elsewhere it links to the existing `/about`.
   - `app/(patient)/patient/[id]/about/page.tsx` is the new
     patient-side disclosure — same regulatory wording, renders
     in the patient route group with a single "Return to your
     accounts" emerald button. No caregiver-dashboard button, no
     legal-links nav, no brand-link redirect to `/`. The bank
     illusion holds.
   - The marketing layout reverted to its pre-cookie shape; per-
     tab URL gives us context for free, the cookie was the wrong
     primitive.
10. **Production smoke re-verification.** After `cbb5230`
    deployed, both flows verified side-by-side in the same
    browser: patient tab (`/patient/[id]` → disclosure →
    `/patient/[id]/about` → "Return to your accounts" → back to
    patient view, no caregiver leak) and caregiver tab
    (`/caregiver` → disclosure → `/about` → "Caregiver
    dashboard" button → back to `/caregiver`, no patient
    blocking). User confirmed "everything works perfectly."

**Additional session work after smoke close:**

- **ADR 0002 — per-patient brand override cancelled.** User
  cited Canadian Bank Act Section 983 plus trademark / passing-
  off jurisprudence; therapeutic upside not worth the legal
  exposure carried by the operator. CLAUDE.md branding
  architecture section updated to reflect the cancellation; the
  `getPatientBrand()` indirection in `lib/branding.ts` survives
  with comments referencing ADR 0002. Original CLAUDE.md plan
  had M6 as the per-patient brand override milestone; M6 now
  becomes auth hardening (see `docs/specs/M6.md`).
- **M6 spec drafted.** `docs/specs/M6.md` is the pre-flight
  contract for the next milestone: Cloudflare Turnstile CAPTCHA
  on `/sign-up` / `/sign-in` / `/forgot-password`, per-email
  lockout layered on the existing per-IP rate limiter, Vercel
  WAF rules (Pro tier, conditional on budget), and
  `docs/security/auth-hardening.md`. Six open questions need
  user answers before M6 coding starts.

## In progress

None — M5 is functionally complete. M6 prep (spec + ADR +
CLAUDE.md updates) landed in the same session; M6 coding begins
once the six open questions in `docs/specs/M6.md` are answered.

## Not started — deferred

**Step 10 — Documentation finalization + README + green check.**
Per the M5 plan doc this covers `docs/deployment.md`,
`docs/admin-runbook.md`, launch-ready `README.md`, and the final
patient-vocab + B4A-residue audits. The site is live and smoke-
passing without these docs; they don't block external traffic.
Deferred at user request to start M6 prep first. Can fold into
M6's Step-10-equivalent close-out, or run as a separate small
session before M6 coding starts.

## Decisions made this session (don't relitigate)

Numbering continues from `M5-progress.md`'s previous Step 9.2/9.3
close (last entry was #63). New decisions for sub-steps 9.4 and
9.5 are 64–67.

### Step 8

54. **RLS is dormant in production; app-layer is primary.** The
    app's `lib/db` connection points at Supabase's session pooler
    as the `postgres` superuser, which has `BYPASSRLS`. The
    `supabase/policies.sql` policies only fire under the
    `authenticated` role via PostgREST or the Supabase JS data
    path, neither of which the app currently uses for queries.
    Authorization runs through `getCurrentCaregiver()` +
    `getPatientForCaregiver()` + scoped query filters. The RLS
    policies are defense-in-depth for the day a future feature
    (Realtime subscriptions, browser-side reads) reaches for that
    path. Documented in `docs/security/rls-audit.md`'s
    "Production enforcement model" section so the next contributor
    finds it without spelunking.
55. **`audit_log_owner` uses direct `caregiver_id` scope, not a
    patient join.** The audit-log writer in `lib/audit-log.ts`
    already stamps `caregiver_id` at every insert; the simplest
    correct policy matches that invariant. A patient-join would be
    structurally similar to `deposit_codes_owner` but adds a join
    step the data model doesn't need — `caregiver_id` is the
    direct owner of every row.
56. **Real-Postgres test uses `sql.reserve()` + manual
    `BEGIN`/`ROLLBACK` rather than `sql.begin()`.** postgres-js's
    `.begin()` commits on success and only rolls back on thrown
    error; we want ROLLBACK both ways so the positive-control
    self-row UPDATE side effects don't leak between tests. The
    test wraps each `asCaregiver(userId, fn)` invocation in this
    pattern.
57. **`auth.uid()` stub + `authenticated` role + `set_config(
    'request.jwt.claim.sub', $1, true)` per transaction.** This
    triple is Supabase's runtime contract: PostgREST switches to
    the `authenticated` role and sets the JWT `sub` claim; the
    real-Postgres test mirrors that exactly so the policies see
    the same execution context they'd see in a production
    PostgREST request. `set_config(...)` with `is_local=true` is
    the parameterizable form of `SET LOCAL` (which doesn't accept
    placeholders).
58. **`onnotice: () => {}` on the postgres-js client in
    `rls-cross-tenant.real.test.ts`.** `supabase/policies.sql`
    opens with idempotent `drop policy if exists ...` statements;
    on a fresh container, every drop emits a `NOTICE: policy ...
    does not exist, skipping`. postgres-js prints these to stdout
    by default — without the silencer, the test output is dozens
    of NOTICE objects before the first test result.
59. **Provision Sentry DSN now (vs. accept silent no-op for
    launch).** User confirmed via AskUserQuestion. M5 spec
    acceptance includes "a dev-mode hit to `/debug-sentry`
    triggers a captured error in Sentry" — without the DSN, that
    line is unverified at launch. Five extra minutes of Sentry-
    dashboard clicking now closes the acceptance gap before deploy.

### Step 9.1

60. **`gh repo create` instead of web-UI flow.** Plan doc pre-baked
    the exact command. `gh auth status` already showed Talnerith
    authenticated with `repo` scope. Single command, no prompts,
    repo created and master pushed in one round-trip. Private per
    plan (no public release until M10 marketing is reviewed).

### Step 9.2 + 9.3

61. **User-level Sentry token (`sntryu_`) accepted over org-level
    (`sntrys_`).** Functionally equivalent for source-map upload
    when the right scopes are checked (`project:read`,
    `project:releases`, `org:read`). Durability concern: if the
    user loses Sentry account access, Vercel builds fail source-
    map uploads (app still serves; production stack traces just
    show minified code until the token is regenerated).
    Acceptable for a solo project — the user creates the token,
    no need for an org-level token's broader blast radius.
62. **`APP_BASE_URL` set to `https://clearviewsavings.com` in
    Vercel during 9.3, before DNS goes live.** `APP_BASE_URL` is
    consumed only by the auth-email webhook for confirmation-link
    construction, and the Supabase Auth Hook itself still points
    at the dead ngrok URL until sub-step 9.5. By the time
    anything reads `APP_BASE_URL` in production, DNS is live. No
    race — setting it to the dead ngrok value or leaving it
    unset would just require an extra Vercel-env-vars edit later.
63. **Vercel env vars applied to all three environments
    (Production + Preview + Development).** Preview deploys from
    PRs need the same vars to actually boot; Vercel's
    "Development" environment is for `vercel dev`, which we don't
    use locally, but the cost of leaving it on is zero.

### Step 9.4

64. **Apex `clearviewsavings.com` is the primary URL; `www`
    307-redirects to apex.** Matches the M5 plan and the wider
    industry trend over the last several years (apex-first vs.
    www-first). Apex is shorter, more memorable, and aligns with
    the brand name in marketing copy. The reverse direction (www
    primary, apex redirects) is also valid, but the plan doc and
    user's brand assumption (`clearviewsavings.com` everywhere)
    both already favored apex. The Vercel UI offered this as a
    one-click toggle on the Domains row after the initial setup
    landed both rows green.
65. **Sentry config uses Alert Rule Action + project Alert Rule
    (not webhook resource subscriptions).** Our handler at
    `app/api/sentry-webhook/route.ts:18-22,68-76` reads
    `payload.data.event.level`, which is the Alert Rule Action
    payload shape. The `issue` webhook resource subscription
    delivers payloads under `data.issue` (different field), which
    would never match our `event.level === "fatal"` filter — so
    subscribing to `issue` would deliver webhooks that silently
    no-op. Two ways to fix the gap: (A) toggle Alert Rule Action
    ON and create a project Alert Rule with `level == fatal`,
    keeping the handler unchanged; or (B) change the handler to
    read `data.issue.level` plus an `action === "created"` filter,
    requires redeploy. Picked (A) — it moves the level-fatal
    filter into Sentry's native rule UI (where it belongs and
    composes with other rule conditions), and avoids a code
    change. The handler stays a thin payload-forwarder.

### Step 9.5

66. **Sentry default "Send a notification for high priority
    issues" rule kept enabled.** This is Sentry's auto-created
    rule on new projects. It uses Sentry's built-in email
    notifier (not our custom integration) to alert Suggested
    Assignees → Recently Active Members on issues Sentry
    classifies as high priority. On a solo org with one Sentry
    user, both branches resolve to the user's Sentry account
    email. The rule is complementary to the
    `Fatal events → admin email` rule — that one catches only
    fatals via our integration; the default rule catches the
    wider "high priority" classification via Sentry's native
    path. Different mechanisms, no duplication. Disable later if
    it turns out to be noisy after launch; easy to re-enable.
67. **Used newer Vercel A record IP `216.198.79.1` and newer
    www CNAME `e1eb041bb1424ae8.vercel-dns-017.com.` over the
    older `76.76.21.21` and `cname.vercel-dns.com.` mentioned in
    the M5 plan doc.** Vercel's Settings → Domains UI now
    surfaces the newer values by default. The older values
    still work but are deprecated as part of Vercel's planned IP
    range expansion. Future-proofs the records without breaking
    anything.

### Sub-step 9.6 + post-smoke polish

68. **URL-based per-tab disclosure routing beats a cookie-based
    session marker for the patient-leak fix.** First two attempts
    used a `cv_patient_active` cookie set by middleware on
    `/patient/*` requests. Cookies are browser-wide — any
    caregiver who had ever visited a patient route in the same
    browser had their caregiver-side marketing nav blocked for
    ~15 minutes, blocking legitimate "back to caregiver
    dashboard" navigation from `/about` in their caregiver tabs.
    The right primitive is URL: each tab carries its own URL, so
    "is this a patient session" is naturally per-tab. The
    `FooterDisclosure` reads `usePathname()` and routes its
    "Learn more" target accordingly. No cross-tab interference.
69. **`FooterDisclosure` became a client component (instead of
    using middleware-set `x-pathname` headers in a server
    component).** The alternative was setting a request header
    in middleware and reading via `headers()` server-side. Both
    work. Picked the client-component route because it's a
    single hook call against a Next-provided primitive
    (`usePathname()`); the middleware approach would have added
    a header just to read it back two layers down. The component
    is small and the hydration cost is negligible against the
    server-rendered initial value.
70. **Patient-side disclosure lives at `/patient/[id]/about`
    inside the patient route group, not at `/about?patient=…`
    or a re-skinned marketing-layout variant.** The disclosure
    detour should *feel* like part of the bank UI: same brand
    header, same patient-vocab page chrome, no marketing nav.
    A dedicated route under the patient route group inherits the
    patient layout automatically and lets the
    `getPatientBrandById(id)` resolution mirror the main patient
    page (so M6 / future brand work flows through unchanged
    even though M6 brand override is now cancelled — see
    decision 71). Same content shape as `/about`'s regulatory
    callout, but stripped of caregiver-facing essay paragraphs
    that contain forbidden patient-vocab ("dementia",
    "Alzheimer's", etc.).
71. **Per-patient brand override cancelled, M6 reassigned to
    auth hardening.** Original CLAUDE.md plan had M6 as the
    per-patient brand override (caregivers configure their
    patient's actual former bank name for therapeutic
    recognition). User cited Canadian Bank Act Section 983 +
    trademark / passing-off jurisprudence: the operator carries
    the legal exposure for caregiver-configured real-bank
    names, and that exposure is not worth the bounded
    therapeutic upside. Decision captured in ADR 0002. CLAUDE.md
    Branding architecture section rewritten to reflect the
    cancellation as explicit non-feature; the
    `getPatientBrand()` indirection in `lib/branding.ts` and
    its callsites stay in place (zero cost, forward
    flexibility for an unrelated future use case like
    white-labeling for a memory-care facility). M6 scope is
    now external-threat auth hardening — see
    `docs/specs/M6.md`.
72. **M5 Step 10 documentation polish deferred, not blocking
    shipping.** The site is live at clearviewsavings.com,
    smoke-passing end-to-end, and the deferred Step 10 work
    (`docs/deployment.md`, `docs/admin-runbook.md`, launch-
    ready `README.md`, final patient-vocab + B4A-residue
    audits) is purely operational documentation that doesn't
    block external traffic. User prioritized starting M6 prep
    (auth hardening) over the docs-polish backfill. M6's
    close-out can fold the deferred Step 10 work in, or run as
    a separate session before M6 coding starts. Either way,
    M5's frozen spec acceptance criteria are satisfied — only
    the implementation-plan housekeeping is outstanding.

## Known issues / TODOs

- **If 9.6 smoke fails fatal-sentry, recheck the Sentry webhook
  secret first.** User verified 2026-05-18 that
  `SENTRY_WEBHOOK_SECRET` in Vercel + `.env.local` matches
  Sentry's displayed Webhook Secret on the
  `clearview-savings-webhook` Internal Integration. The HMAC
  verification at `app/api/sentry-webhook/route.ts:55-57` should
  accept Sentry's signed payloads. But if the smoke shows
  fatal-sentry not firing, recheck — secrets can drift (e.g.,
  if Sentry regenerates on plan changes or if Vercel env was
  edited without redeploying).
- **`APP_BASE_URL` in local `.env.local` still points at the dead
  ngrok URL from Step 3 dev testing.** Vercel env has the correct
  prod value (`https://clearviewsavings.com`) — only the local
  file is stale. Cosmetic; either update to match prod or leave
  for the x-forwarded-header fallback when running locally.
- **Browser console noise on the Vercel deploy (confirmed non-
  issues; do NOT redebug).** Two patterns appear in DevTools but
  neither originates in our code:
  - `/monitoring?o=…&p=…&r=us:1 Failed to load resource:
    net::ERR_BLOCKED_BY_CLIENT` — Sentry telemetry tunnel blocked
    by the user's ad-blocker. The whole point of routing through
    `/monitoring` was to dodge ad-blockers, but some block-lists
    are aggressive enough to match by query-string params (`o=`,
    `p=`, `r=`) anyway. Server-side Sentry capture still works
    (the `/debug-sentry` test in 9.2 successfully landed an
    event); only this specific browser's telemetry is dropped.
    Incognito mode (or disabling the extension) confirms.
  - `Uncaught (in promise) Error: A listener indicated an
    asynchronous response by returning true, but the message
    channel closed before a response was received` — Chrome
    extension noise from `chrome.runtime.onMessage` listeners
    (1Password, Bitwarden, AdBlock, Grammarly, etc.). Not from
    our code. Incognito confirms.
- **ImprovMX apex SPF is optional and unset.** Decision 28.
  Revisit only if forwarded mail starts landing in spam.
- **`@sentry/cli` post-install scripts not approved.** pnpm
  warning shows on install. The cli isn't needed locally — only
  at Vercel build time, where Vercel's pnpm install is configured
  differently and the cli runs cleanly (verified in 9.3 deploy
  log). Safe to ignore locally.
- **Step 10 docs polish outstanding.** Decision 72 explains the
  deferral; the work itself (`docs/deployment.md`,
  `docs/admin-runbook.md`, launch-ready `README.md`, final
  patient-vocab + B4A-residue audits) is still on the table for
  before-launch polish whenever it makes sense.
- **Windows re-anchor script invocation.** From PowerShell, the
  bare `bash scripts/re-anchor.sh | Set-Clipboard` form routes
  through WSL by default and fails if WSL isn't installed (this
  user's setup). The working invocation:
  `& "C:\Program Files\Git\bin\bash.exe" scripts/re-anchor.sh |
  Set-Clipboard` — call operator `&` is required because
  PowerShell parses a line starting with a quoted string as a
  literal, not a command. Or just say "re-anchor" to Claude —
  reading the docs directly produces the same orientation.

## Exact next step

**Write `docs/milestones/M6.md` (the M6 implementation plan), then
begin step-by-step M6 build.**

M5 is functionally closed. The M6 spec at `docs/specs/M6.md` is
**frozen** as of commit `3a9a188` — all six open questions have
user-locked answers (see the "Resolved (spec frozen)" section in
the spec for the six resolutions with reasoning). M6 prep is
complete; implementation planning is the natural next step.

The implementation plan should mirror `docs/milestones/M5.md`'s
structure: numbered build steps with pause points, decision-
resolution carryover from the spec's resolved section, tests
landing per step, and a re-anchor protocol at the bottom for
mid-milestone session handoffs.

Frozen M6 scope at a glance (from `docs/specs/M6.md`):

- Cloudflare Turnstile CAPTCHA on `/sign-up`, `/sign-in`,
  `/forgot-password` (bypassed in non-prod and via
  `TURNSTILE_TEST_BYPASS_KEY` env var in Vercel Preview)
- Per-email lockout: 5 failed/15-min sliding window → 15-min
  lockout, layered on the existing per-IP limiter
- New admin notification kind `email-lockout` (silent to user,
  admin-only, one email per lockout event)
- `docs/security/auth-hardening.md` documenting the layered
  protection stack
- Tests: per-email lockout in `lib/rate-limit.test.ts`, mock-
  Turnstile sign-up integration test, `email-lockout` template
  snapshot

Out of M6: Vercel WAF (deferred — Hobby tier sufficient), CAPTCHA
on `/reset-password`, MFA/2FA, password complexity, pwned-password
check, session management UI, new-device login alerts,
locked-user notification email.

**Loose M5 ends that don't block M6:**

- Step 10 docs polish (`docs/deployment.md`,
  `docs/admin-runbook.md`, launch-ready `README.md`, final
  patient-vocab + B4A-residue audits) — can run as a small
  separate session at any point or fold into M6 close-out.
- `APP_BASE_URL` local `.env.local` still points at the dead
  ngrok URL from Step 3 dev testing. Cosmetic; fix when next
  touching local env.

## Re-anchor checklist for the next session

M5 is closed. The active milestone is M6 (auth hardening); the
frozen pre-flight contract is `docs/specs/M6.md`. A re-anchored
session should read in this order:

1. Read `CLAUDE.md` (recently updated — Branding architecture
   section now reflects per-patient brand cancellation; ADR
   0002 referenced)
2. Read `docs/specs/M1.md` through `M5.md` for milestone history
   (skim `M1`–`M4`; full read of `M5.md` for "what was M5's
   scope" context)
3. Read `docs/specs/M6.md` — **the active pre-flight contract**
4. Read `docs/decisions/0001-computed-on-load-deposits.md` and
   `docs/decisions/0002-no-per-patient-brand.md` for the
   architectural backbone
5. Read this file — `docs/milestones/M5-progress.md` — for
   "what's the recent state" context
6. Inspect actual files to confirm reality matches: `git log
   --oneline -5` should show the M6 prep commits (ADR + CLAUDE.md
   update + M6 spec + this progress refresh); `git status`
   clean; remote tracking `Talnerith/clearview-savings`.
7. Run `pnpm typecheck && pnpm lint && pnpm test --run` for a
   green baseline (expect 152 passing / 42 skipped in the
   default lane; gated real-Postgres suite remains opt-in).
8. **Check whether the user has answered the six open questions
   in `docs/specs/M6.md`.** If not, ask. If yes, proceed to write
   `docs/milestones/M6.md` (the implementation plan, mirror of
   `M5.md`'s structure).
9. Wait for "go" before writing M6 code.

`scripts/re-anchor.sh 6` (when invoked with milestone 6) prints
the above plus the last 10 commits and current git status. On
Windows from PowerShell, use the call operator:
`& "C:\Program Files\Git\bin\bash.exe" scripts/re-anchor.sh 6
| Set-Clipboard` (the bare `bash` form routes through WSL and
fails if WSL isn't installed).
