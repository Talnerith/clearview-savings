# M7 progress — caregiver account MFA (TOTP)

**Status: CLOSED 2026-06-06.** All 8 steps done; the Step 8 production
smoke passed end-to-end (with two fixes found and shipped during it,
below). **M8 coding is now unblocked** — start at `docs/specs/M8.md` →
`docs/milestones/M8.md`, Step 1 (widen `WorkbookGrade` to `0|1|2|3`).

Suite at close: `pnpm typecheck && pnpm lint && pnpm test --run` green —
**222 passed, 42 skipped**; `pnpm build` clean. Repo pushed to
`origin/master` (close-out commit pending on top of `b7c0d30`).

## Step 8 — production smoke result (2026-06-06)

Ran against the live Vercel production deploy with a real authenticator
app and the `ADMIN_EMAIL` inbox. Walked the full spec acceptance flow.

| Phase | Check                                              | Result |
| ----- | -------------------------------------------------- | ------ |
| 0     | Push/deploy + green-check (build, test, vocab grep) | ✅      |
| 1     | Enroll → QR → verify → 10 recovery codes shown once | ✅      |
| 2     | Enforced TOTP sign-in → `/challenge` → `/caregiver` | ✅      |
| 3     | Recover with a code → factor removed → re-enroll    | ✅ (fixed) |
| 4     | Re-enroll + regenerate (old set stops working)      | ✅      |
| 5     | Disable MFA (fresh TOTP) → `mfa-disabled` email     | ✅      |
| 6     | `/patient/[id]` unaffected — no challenge ever      | ✅      |
| 7     | Criterion F — reset does not bypass MFA             | ✅ (fixed) |

Two real defects surfaced during the smoke — both fixed, tested, and
deployed before the phase was marked green:

### Bug 1 — recovery-code loop (commit `fc8bb9f`)

Phase 3: after spending a recovery code, the caregiver was bounced back
to `/challenge` in an endless loop; a subsequent TOTP verify looped too.
Root cause: `recoverWithCodeAction` deleted the verified factor through
the **privileged admin client** (a separate client), but never refreshed
the caregiver's own session. `getAuthenticatorAssuranceLevel()` reads the
factor list off the session JWT, not the server, so `getAalState()`
stayed `"aal1-needs-aal2"` and the middleware gate kept redirecting.
**Fix:** `supabase.auth.refreshSession()` after `deleteFactor`, so the
re-issued JWT carries no factor → `"no-factor"` → through the gate.

### Bug 2 — reset-password dead-end under MFA (commit `b7c0d30`)

Phase 7: a forgotten-password caregiver with MFA hit *"AAL2 session is
required to update email or password when MFA is enabled"* and was
dead-ended — the raw SDK string leaked into the UI. The M7 plan's
deviation note had assumed `updateUser` succeeds at AAL1 then the
`/caregiver` redirect triggers the challenge; **that premise was wrong**
— Supabase blocks `updateUser` itself at AAL1. Security still held (the
reset never bypassed MFA), but the legitimate flow was broken.
**Fix:** a step-up — `reset-password` detects `aal1-needs-aal2` and
routes through `/challenge?next=/reset-password` (validated `next` via
`lib/auth/next-path.ts`), returning the caregiver to the reset form once
AAL2. This *requires* the authenticator on top of email access —
strengthening, not bypassing, MFA. Residual error mapped to a calm
message. The M7.md deviation note was corrected in place.

## Done (full M7)

- Steps 2–6 (prior sessions, commits `d94f946`…`9cd6581`):
  `mfa_recovery_codes` table + RLS, privileged admin client +
  recovery-code lib, caregiver settings + TOTP enrollment, sign-in
  two-step + `/challenge` + AAL2 gate, lost-device recovery + disable
  MFA + `mfa-disabled` notification.
- Step 7 (`74218fd`): `docs/security/auth-hardening.md` MFA layer +
  two-tier lost-device runbook.
- Step 8 (this session, `fc8bb9f` + `b7c0d30`): production smoke + the
  two fixes above + corrected deviation note.

## In progress / Not started

Nothing in M7 — it is closed. Next is **all of M8** (plan:
`docs/milestones/M8.md`), now unblocked.

## Decisions made this session (2026-06-06)

1. **AAL state is JWT-local, so any out-of-band factor change must
   refresh the session.** Both bugs share this root cause: deleting a
   factor via the admin client (Bug 1) and Supabase's AAL2 gate on
   `updateUser` (Bug 2) are invisible to a stale session JWT. Recorded so
   future MFA work refreshes the session after any admin-side factor
   mutation.
2. **Password reset under MFA is a step-up, not a bypass.** Reset routes
   through the TOTP challenge (`?next=/reset-password`) rather than
   letting the password change ride an AAL1 recovery-link session.
   Supersedes the original "reset needs no change" deviation note.
3. **`next` redirect targets are sanitized to internal paths**
   (`safeNextPath`) to keep the new return-path plumbing free of
   open-redirects — mirrors the existing origin check in
   `app/auth/callback/route.ts`.

## Known issues / TODOs

- None open for M7. No code TODO/FIXME left in the tree.
- `/patient/[id]/submit-work` still present in the build — expected; its
  removal is **M8 Step 7**, not an M7 leftover.

## Exact next step

M7 is closed. Begin M8 per the re-anchor order: `CLAUDE.md` →
`docs/specs/M8.md` (frozen contract) → `docs/milestones/M8.md` (plan) →
this directory's `M8-progress.md` (once it exists). First code edit is
**M8 Step 1**: widen `WorkbookGrade` to `0|1|2|3` in
`lib/workbook-content/types.ts` and add the `gradeLabel` helper. Wait for
"go" before writing code.
