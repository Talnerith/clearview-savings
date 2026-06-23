# M6 production smoke-test script — Step 7

The walk-through for verifying M6 in production. Six tests + a
green-check audit. Drafted during the M6 session that closed on
2026-05-20; the smoke itself runs in a later session.

When all six tests pass, reply "smoke green" to the resuming
session and it will write the M6 close-out commit.

## Pre-flight

**P1. Push the M6 commits and wait for Vercel.**

```sh
git push origin master
```

Vercel auto-builds from master. Watch the dashboard until the
deploy goes green. If the build fails, paste the error and the
resuming session will debug before any smoke.

**P2. Confirm production env vars.** In Vercel → Settings →
Environment Variables, verify Production has:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ✓
- `TURNSTILE_SECRET_KEY` ✓
- `TURNSTILE_TEST_BYPASS_KEY` — should **NOT** exist in Production
  (Preview only)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — already
  there from M5
- `ADMIN_EMAIL` — already there from M5

**P3. Confirm Supabase Auth CAPTCHA toggle is on.** Supabase
dashboard → Authentication → Settings → Bot and Abuse Protection.
Provider = Turnstile. Secret = matches `TURNSTILE_SECRET_KEY`.

**P4. Open these tabs** — you'll need all of them:

- Production site: `https://clearviewsavings.com`
- Admin inbox (the address you put in `ADMIN_EMAIL`)
- A throwaway email inbox you control (Gmail + alias works, or a
  temp-mail service)
- Upstash console → `clearview-savings-prod` → Data Browser
- A way to hit the site from a second IP (mobile hotspot is
  easiest; or a VPN on one device)

## Test 1 — Turnstile blocks empty submit on `/sign-up`

1. Open `https://clearviewsavings.com/sign-up` in a fresh
   incognito window.
2. **Expected:** the Turnstile widget renders below the password
   field. Don't interact with it.
3. Type a throwaway email and a password ≥8 chars.
4. **Open browser devtools → Network tab** before clicking submit.
5. Click "Create account" without solving the widget (most
   Turnstile Managed-mode runs auto-solve invisibly — if it's
   already green, just submit immediately; if it asked for a
   click, don't click).
6. **Expected on the redirected page:** the calm red error banner
   reads `Please verify and try again.` URL has
   `?error=Please+verify+and+try+again.`
7. **Expected in the Network tab:** no POST to
   `*.supabase.co/auth/v1/signup`.

✅ if the widget short-circuits and Supabase wasn't called.
❌ if the form went through — trace through `verifyTurnstileToken`.

> **Note:** If Turnstile auto-solves invisibly on first load
> (likely on a low-risk fingerprint), you can't easily test the
> "unsolved" path through the real widget — it'll always succeed.
> In that case, skip the failure assertion here and just confirm
> Test 2's happy path works.

## Test 2 — Sign-up + email confirmation end-to-end (happy path)

1. Same `/sign-up` page. Use the throwaway email + a password you
   can remember (call it `PW1` for later steps).
2. Let Turnstile solve (one click if visible, automatic if
   managed-invisible). Submit.
3. **Expected:** redirects to `/check-your-email?email=...`
4. Check the throwaway inbox. Email subject `Confirm your email at
   Clearview Savings` arrives within ~60s.
5. Click the confirm link.
6. **Expected:** lands at `/caregiver`. You see the caregiver
   dashboard.
7. **Expected in admin inbox:** `[Clearview Savings ops] new
   caregiver — <email>` arrives within ~60s.

✅ if confirmation lands you at `/caregiver`.
❌ if you bounce back to `/sign-in?error=…` or the email never
arrives.

## Test 3 — Per-IP rate limit on `/sign-in`

1. From the same browser, sign out (top-right or by visiting
   `/sign-out`).
2. Open `/sign-in`. Type your throwaway email + a **wrong**
   password.
3. Submit. Expected: redirects back to
   `/sign-in?error=Invalid+login+credentials` (or similar) with a
   red error banner. Do **not** refresh between attempts.
4. Repeat 5 more times — 6 total wrong-password submits in under
   60 seconds from this browser.
5. **Expected on attempt 6:** the amber-bordered calm message
   `Please wait a moment and try again.` URL has
   `?error=rate_limited`.

✅ if attempt 6 from one IP gets blocked. This is the M5 per-IP
limiter firing.

> **Important:** attempts 1–5 here also count toward the per-email
> lockout counter. So after this test, the email's failure
> counter is at 5. If you submit one more wrong password from a
> different IP after this, the per-email lockout will fire on
> that attempt. That sets up Test 4 nicely — but it means Test 4
> only needs **one** more wrong attempt to trigger, not 5.

## Test 4 — Per-email lockout (cross-IP)

1. Switch to your second IP (mobile hotspot / VPN / second
   device). Confirm you're on a different public IP —
   `whatismyip.com` will tell you.
2. Open `/sign-in` in a fresh tab. Type the same throwaway email
   + any wrong password.
3. Submit.
4. **Expected:** redirects to `/sign-in?error=rate_limited` with
   the amber calm message — even though this is the *first*
   attempt from this IP. The per-email lockout has fired (you're
   on attempt 6 of the email's 15-min window).
5. **Verify in Upstash console** → Data Browser → search for
   `rl:email-lock:`. You should see
   `rl:email-lock:<your-throwaway-email>` with TTL ~900s.
6. **Verify in admin inbox:** `[Clearview Savings ops] email
   lockout — <email>` arrives within ~60s. Body shows email,
   most-recent IP (the second IP), and `attemptsInWindow: 5`.
7. Submit *one more* wrong password from the second IP.
8. **Expected:** same calm message. **Expected in admin inbox:**
   *no second email* — one notification per lockout event, not
   per attempt.

✅ if (a) the second IP gets blocked on its first attempt, (b)
the lockout key exists in Upstash, (c) one (and only one) admin
email arrived. ❌ if any of those three fail — most likely culprit
is the IP normalization or the atomic INCR threshold check.

> **If Test 3 succeeded but you hit a different blocking path
> here** (e.g., second IP also blocked at the per-IP layer
> because the IP is shared by enough other users to have its own
> limiter pressure), wait 60s for the per-IP window to clear
> before submitting from the second IP and retry from step 2.

## Test 5 — Forgot password (and confirm `/reset-password` has no widget)

1. From any IP. Open `/forgot-password`.
2. **Expected:** Turnstile widget renders below the email field.
3. Type the throwaway email. Solve Turnstile. Submit.
4. **Expected:** redirects to `/forgot-password?status=sent` with
   the emerald banner: `If that email exists, we sent a reset
   link.`
5. Check the throwaway inbox. Email subject `Reset your Clearview
   Savings password` arrives within ~60s.
6. Click the reset link.
7. **Expected:** lands at `/reset-password`. **Critical
   assertion:** there is **no** Turnstile widget on this page.
   Just the new-password and confirm-password fields.
8. Set a new password (`PW2`). Submit.
9. **Expected:** lands at `/caregiver` signed in.

✅ if reset-password has no widget and the flow completes.
❌ if a widget appears on `/reset-password` — spec violation
(resolved Q5 in M6 spec).

## Test 6 — Manual lockout clearance runbook

The email is still locked from Test 4 (Upstash key has ~10+ min
left). But you just signed in via the reset link, so the recovery
path effectively cleared the lockout from your perspective. To
exercise the manual runbook:

1. Sign out (`/sign-out`).
2. Try `/sign-in` with the throwaway email + a wrong password.
3. **Expected:** still blocked (the `rl:email-lock` key still
   exists).
4. Open Upstash console → Data Browser. Find
   `rl:email-lock:<email>` and `rl:email-fails:<email>`. Delete
   both.
5. Refresh `/sign-in`, type the email + `PW2` (the new password).
6. **Expected:** signs in successfully.

✅ if the manual key delete unblocks immediately. This validates
the runbook in `docs/security/auth-hardening.md`.

## Green-check audits (run locally after the smoke passes)

```sh
pnpm typecheck && pnpm lint && pnpm test --run
pnpm build
git grep -i -E "alzheimer|dementia|simulated|fake|demo|therapeutic" -- "app/(patient)/**"
```

- First command: all green (you saw 173 passed / 42 skipped at
  the end of Step 5)
- Second command: clean build
- Third command: **no output** — the patient-vocab forbidden
  strings must not have leaked into the patient route group
  through M6 work. M6 touched `(auth)/*` and `lib/*` only, so
  this is paranoia, but it's cheap.

## After smoke passes

Reply "smoke green" to the resuming session. It will:

1. Update `docs/milestones/M6-progress.md`: move Step 7 from "Not
   started" to "Done"; replace the "Exact next step" with "M6
   complete."
2. Commit as `docs: M6 close-out — smoke green`.

If any test fails, paste the failure to the resuming session and
debug before close-out.
