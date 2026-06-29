# M9 progress — lower-friction reward entry + real-bank patient UI

**Status: CLOSED 2026-06-13. All 7 steps complete (Step 1 reverted —
see Deviations in `docs/milestones/M9.md`). Visual-review round 1
(`a4da006`: desktop-dedicated UI per ADR 0005, reactive controls,
full name in greeting), round 2 (decorative bank chrome per ADR 0006,
site-wide design sync, currency removed from view/config, Sentry
config rename), and round 3 (user-approved 2026-06-13, no further
changes) have landed. Step 7 close-out done: green-check, design
review vs. CLAUDE.md hard rules (all pass), no CLAUDE.md edit needed,
batch pushed.**

Green at close-out: `pnpm typecheck && pnpm lint && pnpm test --run` —
**303 passed, 42 skipped** (Docker-gated suite); `pnpm build` clean;
forbidden-vocab grep over `app/(patient)` clean.

## Step 7 close-out (2026-06-13)

- **Green check:** typecheck ✓, lint ✓, test 303 passed / 42 skipped ✓,
  build ✓.
- **Forbidden patient-vocab grep:** clean (the prior "degrade"/"grade"
  false positive does not match the tightened pattern).
- **Design review vs. CLAUDE.md branding hard rules — all pass:**
  brand never contains "bank/banking/banker"; palette is
  emerald + slate/navy neutrals (no TD green / RBC / BMO / Scotia /
  CIBC signature palette); decorative chrome (`PatientNav`,
  `InfoRail`) uses generic terms only — no real-bank product names,
  no deposit-insurance (CDIC/FDIC) claims — and all fake controls are
  non-interactive + `aria-hidden`; the Security Reminder panel is
  truthful anti-phishing copy; footer disclosure renders on every
  page from the root `app/layout.tsx` (untouched).
- **CLAUDE.md edit:** none required — M9 reverses no CLAUDE.md rule
  (the two reversed *spec non-goals* are captured in ADR 0005/0006,
  not CLAUDE.md).
- **Dev-environment note:** a broken `node_modules` (missing
  `styled-jsx` in the `.pnpm` tree) was repaired with `pnpm install`
  on 2026-06-13; source unaffected.
- **Push:** the local batch pushed to `origin/master`.

**Local-only commits, not pushed** (`d163e7f`… plus round-2 batch).
Push is part of Step 7 close-out.

## Done

| Commit | What |
| ------ | ---- |
| `d163e7f` | Step 1 — oversized chunked code on reward check PDF (**reverted by `9f87dd3`**) |
| `4cc2d5d` | Step 2 — wizard grouped code entry ("ABCD 2345" display, text-4xl, whitespace-tolerant `redeemCodeAction`); helpers extracted to `deposit/code-entry.ts` + tests |
| `9f87dd3` | Revert of Step 1 print changes + deviation recorded in the plan ("print" meant the web UI; checks were fine) |
| `ac1ba62` | docs — frozen M9 spec committed |
| `869e53d` | Step 3 — persistent white header bar (`patient/[id]/layout.tsx`), base 18→20px, per-page headers/dup helpers collapsed into `patient-format.ts` + `WelcomeFallback.tsx` |
| `9c1c8ed` | Step 4 — home: full-bleed emerald-900 greeting band, white "Deposit a Check" pill, bank-style account rows; tx preview removed from home |
| `49629bf` | Step 5 — account: emerald-900 hero band; Date/Description/Amount/**Balance** table; new `lib/running-balance.ts` + tests |
| `7039bce` | Step 6 — type-scale sweep over wizard/done/about/PendingBanner + two AAA contrast fixes (emerald-900/80 → solid; slate-600 → slate-700) |
| `a4da006` | Visual-review round 1 — desktop-dedicated patient UI (ADR 0005, max-w-6xl containers, left/right band composition, no column collapse, "Click" wording), reactive controls (hover/active/cursor-pointer, press compression, submit spinner, new `patient/[id]/loading.tsx`), full display name in greeting |
| `584c795` | Round 2 — Sentry deprecated build options renamed (`webpack.treeshake.removeDebugLogging`, `webpack.automaticVercelMonitors`); warnings gone |
| `8800aeb` | Round 2 — currency never configured or shown: caregiver field removed, `settings.currency` derived from locale region (`lib/locale-currency.ts` + tests), all formatters `narrowSymbol` |
| `fed1387` | Round 2 — decorative bank chrome (ADR 0006): `PatientNav` strip + `InfoRail` panels; only My Accounts/Deposit navigate, rest aria-hidden set dressing; home/account two-column with rail |
| `6a299f2` | Round 2 — site-wide design sync via shared tokens: `--primary` → emerald-700, shared `Button` cursor/hover/active, headers max-w-6xl + Brandmark lg, landing hero on emerald-900, caregiver `loading.tsx` |

## In progress

- Nothing — M9 is CLOSED (see Status block and Step 7 close-out above).

## Not started

- Nothing remaining in M9.

The round-3 review was approved by the user 2026-06-13 ("everything
looks great") with no further adjustments. Step 7 close-out then ran
to completion: green-check, design review, no CLAUDE.md edit, push.

## Decisions made this session

1. **Spec frozen 2026-06-11** with user locks: mechanism (a) chunked
   oversized code; reward checks only; palette stays deep emerald.
2. **Step 1 reverted same day:** the user's "print needs to be larger"
   meant the patient *web UI*, not paper — "the checks were actually
   great." Spec acceptance criterion 1 waived; recorded under
   Deviations in the plan. Wizard entry-side changes (Step 2) kept.
3. **Single grouped code input, not two boxes** — focus-jumping
   between boxes is its own friction for a dementia patient.
4. **White header bar instead of the plan's emerald header band**
   (plan was mutable, updated here): matches the TD reference (white
   nav + colored hero), and Brandmark's icon/dark wordmark need a
   light background. The deep-emerald identity lives in the
   greeting/hero bands instead.
5. **Band shade emerald-900** (≈10:1 with white, AAA); `emerald-800`
   for positive amounts/account names on white (≈7.7:1, AAA);
   secondary text slate-700 (slate-600 on slate-50 fails AAA at
   ~6.9:1).
6. **Home page no longer previews transactions** — the account page
   owns the full table; home is greeting + deposit action + account
   rows, per the references and one-primary-action rule.
7. **Running balance derived backwards from `balance_cents`** over
   (postedAt desc, id desc) so the newest row reconciles with the hero
   figure despite the 50-row query limit.
8. **Wizard/done pages stay max-w-2xl** (focused flows); home/account
   widened to max-w-3xl for the table. *(Superseded by round-1 review:
   see decision 9.)*
9. **Patient web UI is desktop-dedicated — ADR 0005 (round-1 review,
   2026-06-11).** The user: the site looked like a mobile app; the
   patient browses on a PC, and mobile will be a separate app later.
   Containers widened (max-w-6xl data pages / max-w-3xl focused
   flows), no small-screen collapse patterns, desktop verbs ("Click").
10. **Reactive controls (round-1 review).** Hover + pressed states and
    explicit `cursor-pointer` on every control (Tailwind v4 preflight
    no longer sets it on buttons), slight press compression on primary
    buttons, spinner beside "Working…", and a route-level
    `patient/[id]/loading.tsx` ("One moment…" under the persistent
    header) for navigation feedback.
11. **Full display name in the greeting (round-1 review)** — the
    `firstName()` helper removed; the patient's own full name is a
    stronger recognition cue.
12. **Decorative bank chrome — ADR 0006 (round-2 review).** The spec's
    "no busy chrome" non-goal reversed by field evidence: the patient
    flags a sparse page as not real. Nav strip + info rail; only "My
    Accounts"/"Deposit a Check" navigate; everything else is
    aria-hidden, non-interactive set dressing with truthful text.
13. **Site-wide sync via shared tokens (round-2 review).** Spec's
    caregiver-restyle non-goal reversed by the user. `--primary` →
    emerald-700, shared `Button` gains cursor/hover/active,
    headers/footers scaled to patient chrome, landing hero on the
    emerald-900 band, caregiver `loading.tsx`. Density untouched.
14. **Currency never configured or shown (round-2 review).** Caregiver
    field removed; region of locale decides currency on save
    (`lib/locale-currency.ts`); all formatters use `narrowSymbol`.
15. **Sentry deprecations fixed** — `disableLogger` /
    `automaticVercelMonitors` → `webpack.treeshake.removeDebugLogging`
    / `webpack.automaticVercelMonitors` (harmless warnings, now gone).

## Known issues / TODOs

- No TODO/FIXME comments left in code.
- Forbidden-vocab grep over `app/(patient)` has one hit: the word
  "degrade" (matches "grade") in a server-side comment in
  `patient/[id]/page.tsx` — not patient-visible, false positive.
- `emerald-700` primary buttons carry white text at ~4.5:1 — passes
  AAA only via the large-text threshold (they're text-2xl semibold).
  Acceptable, but worth confirming in the Step 7 design review.
- The patient chrome layout (`patient/[id]/layout.tsx`) adds one
  best-effort patient query per page view (brand + locale for the
  header date). Cheap, but if it ever matters, React `cache()` could
  dedupe it with the page's own lookup.

## Exact next step

None — M9 is CLOSED. The round-3 review was approved 2026-06-13 and
Step 7 close-out ran to completion (green-check, design review, no
CLAUDE.md edit, batch pushed to `origin/master`). The next session
starts M10: write `docs/specs/M10.md` (frozen pre-flight contract)
before any coding, per CLAUDE.md.

## Re-anchor order (fresh session)

CLAUDE.md → `docs/specs/M9.md` (frozen; criterion 1 waived, see plan) →
`docs/milestones/M9.md` (plan + Deviations) → this file → inspect
`app/(patient)` to confirm → `pnpm typecheck && pnpm lint && pnpm test
--run` → wait for "go".

## Post-M9 addendum (2026-06-29) — not a milestone

Small, mobile-driven additions made after M9 closed (routine feature/fix work,
no frozen spec):

- **Delete a patient** — new caregiver write following the M2/M3
  shared-endpoint pattern: `lib/patients/delete-patient.ts` (ownership-scoped,
  audits `patient_deleted`, cascade cleanup) + co-located pg-mem test;
  `POST /api/m/patients/delete` (`requireApiPatient`); `deletePatientAction`;
  red "Delete patient" button (`ConfirmingForm`) on the patient detail header;
  "Patient deleted." dashboard status. New `audit_action_kind` enum value
  `patient_deleted` → migration `drizzle/0006_worried_scorpion.sql`,
  **applied to production**. Test suite green (343 passed).
- **MFA code autofocus** — `autoFocus` on the challenge-page and Security-section
  code inputs.
- **License** — switched from MIT to a source-available, all-rights-reserved
  notice (no redistribution); README aligned.

Commits: `61026c1` (delete-patient + MFA autofocus), `eea9bd3` (license/README).
The cross-repo record (mobile UI + smoke test) lives in the mobile repo's
`docs/milestones/M3-progress.md` "Post-M3 follow-up". M10 remains the next
proper milestone (write `docs/specs/M10.md` first).
