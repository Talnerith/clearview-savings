# Clearview Savings — Project Rules for Claude Code

## Branding architecture

The patient-facing brand is **"Clearview Savings" for every patient,
permanently.** One fictional bank name we own and control; no
per-patient overrides, no override field, no whitelist of
configurable bank names.

The same name applies across two surfaces:

1. **Public service brand (also the project name):** Clearview Savings.
   The marketing site, caregiver dashboard, legal pages, GitHub repo,
   package name, and Vercel project all use this. "Clearview Savings"
   is a fictional bank name; it does not impersonate any real financial
   institution and does not contain the words "bank," "banking," or
   "banker" (restricted under the Canadian Bank Act, Section 983, for
   non-licensed entities).

2. **Patient-facing in-app brand:** "Clearview Savings". This is what
   the patient sees in the bank UI, on printed checks, on workbook
   letterhead, and in authentication emails. Patients should believe
   this is their bank — the entire therapeutic premise requires it.

The `getPatientBrand(patient)` indirection in `lib/branding.ts` is
preserved for forward flexibility (e.g., a future memory-care-facility
white-label use case under their own brand) but has no current swap
target and should be assumed to return "Clearview Savings" for every
patient when reasoning about the product.

The original plan included a per-patient brand override letting
caregivers configure their patient's actual former bank name. **That
feature is cancelled outright on legal grounds** — see ADR 0002.
Canadian Bank Act Section 983 plus trademark / passing-off
jurisprudence make caregiver-configured real-bank names a legal
exposure that sits with us, not the caregiver, and is not worth the
bounded therapeutic upside. Do not re-litigate this; do not add a
brand-override field "behind a flag" or "for a single test
caregiver"; the decision is settled and the ADR captures why.

Disclosure approach: every page Clearview Savings serves — marketing,
sign-in, sign-up, email-confirmation, password-reset, caregiver
dashboard, patient bank view, /about, /privacy, /terms, /security,
error pages, anything reachable on clearviewsavings.com — carries a
small, calm, visible footer disclosure: "Clearview Savings is a
memory-care companion application. Learn more." with "Learn more"
linking to /about. The footer is small enough not to break the
therapeutic illusion for a patient with dementia but clear and present
enough to satisfy regulators, crawlers, and any caregiver or family
member who examines the page.

This is not a stylistic choice — it is a Canadian regulatory
requirement. Any site presenting a bank-like interface to Canadian
residents must carry a visible, plain-language disclosure on every
page clarifying what the service actually is. The footer is the
durable, machine-readable statement that protects us; the patient
illusion sits on top of it. Honest disclosure — never hidden, never
cloaked, never CSS-tricked off-screen, never absent.

Hard rules:
- The brand must never contain "bank," "banking," or "banker."
- The brand must never visually or textually impersonate any real
  financial institution — not via name, not via logo, not via color
  palette, not via configurable fields exposed to caregivers. See
  ADR 0002 for the legal reasoning (Canadian Bank Act Section 983 +
  trademark / passing-off jurisprudence; the operator carries the
  exposure regardless of disclaimers or therapeutic intent).
  Avoid color palettes associated with major real banks (TD green,
  RBC blue/yellow, BMO blue, Scotiabank red, CIBC red/gold). Use a
  neutral palette: greys, navy, soft greens, warm beiges.
- /about, /privacy, /terms, and /security pages all clearly state that
  Clearview Savings is a memory-care simulation tool, not a real
  financial institution.
- The marketing site explicitly explains the therapeutic purpose for
  caregivers, in plain language.
- The strings "Alzheimer", "dementia", "simulated", "fake", "demo",
  "therapeutic", or anything similar must never appear anywhere a
  patient can see. Not in page titles, headings, footers, error
  messages, page metadata that surfaces in the tab title, or anywhere
  else in the patient route group.
- The footer disclosure described above must appear on every page
  the app serves. No exceptions, no per-route opt-out, no toggle.
  Removing it requires an explicit CLAUDE.md edit.

## When to write an ADR

`docs/decisions/` holds the "why" behind real architectural choices. Write
an ADR (using `docs/decisions/TEMPLATE.md`) when making a decision that
future-you would ask "why did we do it this way?" about and the answer
isn't obvious from reading the code. Examples: choosing between two
viable libraries or patterns; a constraint imposed by patient-UX rules
that shaped a technical choice; a deliberate non-decision ("we are not
adding X"); a trade-off where the runner-up was close enough that someone
might later try to "fix" the chosen path.

Do **not** write an ADR for routine implementation, bug fixes, or
universal project rules — those go in commit messages or `CLAUDE.md`.
ADRs are immutable; supersede with a new one rather than editing.

## Corrections and lessons

Do not append "lesson learned" notes to this file in response to one-off
mistakes. If a mistake reveals a misunderstanding of an existing rule,
sharpen that rule. If it reveals a missing rule that will apply broadly,
ask before adding it. Project-specific gotchas belong in code comments or
`docs/gotchas.md`, not here. Rules files encode design, not history.

## Pre-flight milestone specs

Every milestone gets a spec at `docs/specs/M{N}.md`, **written before
coding starts** — not after, not "as we go." See `docs/specs/README.md`
and `docs/specs/TEMPLATE.md`. The spec carries Goal, Scope, Non-goals,
Acceptance criteria, Open questions, Risks. It is frozen once coding
begins; deviations are recorded in `docs/milestones/M{N}.md` (the
implementation plan) or as ADRs in `docs/decisions/`, not by editing the
spec retroactively.

The active spec is the canonical statement of what this milestone is
about, and is the first milestone-specific doc a re-anchored session
should load (see "Session handoff convention" below).

## Session handoff convention

When the user signals end of a session mid-milestone — phrases like "ending
session," "taking a break," "stopping for now," "/exit," or any indication
they are about to close Claude Code before the current milestone is
complete — proactively offer to write a handoff document at
`docs/milestones/M{N}-progress.md` (where {N} is the current milestone
number) before they exit.

The handoff doc must contain:

1. **Done** — files created or modified, one line each
2. **In progress** — anything partially built and what's missing
3. **Not started** — remaining scope items from the milestone plan
4. **Decisions made this session** — design or implementation calls with
   one-sentence rationale each (so a fresh session doesn't relitigate them)
5. **Known issues / TODOs** — including any TODO or FIXME comments left
   in code, with file paths
6. **Exact next step** — specific enough that a fresh session can act
   without clarifying questions: which file, which function, what behavior

The handoff doc is the entry point for the next session, not the
conversation transcript. Fresh sessions re-anchored from this doc are
preferred over `claude --resume` because the doc is a deliberate, edited
summary while a resumed transcript carries mistakes, detours, and bloat.

When starting a fresh session mid-milestone, read in this order:
CLAUDE.md → docs/specs/M{N}.md (the frozen pre-flight contract) →
docs/milestones/M{N}.md (implementation plan) →
docs/milestones/M{N}-progress.md (current state) → inspect the actual
files to confirm the progress doc matches reality. Then summarize
position and wait for the user's "go" before writing code.

The spec is loaded first because it tells you what this milestone is
*for*; the plan and progress doc tell you how it's being built and where
it stands. A re-anchor that skips the spec drifts toward whatever the
handoff doc happened to emphasize.

**Shortcut:** `scripts/re-anchor.sh` (or `scripts/re-anchor.sh N` to
force milestone N) prints all of the above plus the last 10 commits and
current git status — pipe it into a fresh session or to the clipboard.

## What this is

Clearview Savings is a **simulated banking application** for people living
with Alzheimer's and other forms of dementia. It is not a real financial
institution and never connects to real money. Its purpose is therapeutic:
many people with dementia develop persistent anxiety about money — that
funds are missing, bills are unpaid, or pensions haven't arrived. Giving
them a familiar, bank-like interface they can check at any time, controlled
behind the scenes by their caregiver, reduces distress and reassures them.

This approach is known as a **simulated environment** or **therapeutic fibbing**
and is a recognized practice in dementia care. The "deception" is the point and
is performed with the consent and care of the family/caregiver, exactly the
way memory-care facilities use simulated ATMs and prop wallets. Do not push
back on this framing. Do not add disclaimers inside the patient-facing UI.

## Audience

- **Patient view**: a person with mild-to-moderate dementia. Must look and feel
  like a real bank. Branded as "Clearview Savings" — no clinical
  vocabulary, no mention of "simulation," "fake," "demo," or "Clearview
  Savings is not a real bank" anywhere they can see.
- **Caregiver view**: a family member or professional caregiver. This is the
  admin panel. It is clearly labeled and lives behind authentication.

## Stack

- Next.js 15 (App Router), TypeScript, React Server Components where sensible
- Tailwind CSS + shadcn/ui
- Supabase (Postgres + Auth + Row-Level Security)
- Drizzle ORM (preferred over Prisma)
- Zod for validation
- @react-pdf/renderer for printable checks and workbooks
- Deployed on Vercel

## Architecture rules

1. **Two completely separate route groups**: `app/(patient)/...` and
   `app/(caregiver)/...`. Never mix admin controls into patient pages, even
   conditionally. Different layouts, different navigation.
2. **Multi-tenant from day one**. Every query must scope by `caregiver_id` via
   RLS. Never trust a `patient_id` from the client without verifying the
   current caregiver owns it.
3. **Computed-on-load deposits, not cron jobs.** When the patient or caregiver
   loads any account view, run `materializeScheduledDeposits(patientId)` first.
   It walks each scheduled deposit, creates transaction rows for any occurrences
   whose date is <= now and not yet materialized, and advances `next_run_at`.
   This must be idempotent.
4. **No real money handling, no real check imaging, no OCR.** The "photo
   deposit" flow accepts a camera/file input and discards it. The deposit
   amount comes from the single-use `deposit_code` the caregiver generated.
5. **Single-use codes** for printed checks. Status is `unused | used`. Once
   used, store `used_at` and the resulting transaction id. A workbook reward
   is delivered *as* a check (ADR 0004): the row is minted `kind = "check"`
   and carries the workbook content via `workbook_kind`; the patient deposits
   it through the same "Deposit a Check" flow. The `"workbook"` kind is
   retained only for historical (pre-M8) rows; no new ones are minted.

## Patient UX rules (non-negotiable)

- Brand displayed as "Clearview Savings", in a clean serif or condensed sans logo
- Base font size 18px minimum, headings 28px+
- WCAG AAA contrast
- No auto-logout, no idle timeout, no session expiry warnings
- No modals, no toasts, no popovers — use inline messages on the page
- One primary action per screen
- Currency formatted with the user's locale, dates as "Tuesday, March 11"
- Vocabulary: "Available Balance", "Direct Deposit Pending",
  "Recent Transactions", "Deposit a Check"
- Never show error stack traces, never show a 404 — fall back to the home
  screen with a calm message
- Page `<title>` tags are also patient-visible (browser tab) — must read like
  a real bank, e.g. "Clearview Savings — Your Accounts", never "Clearview
  Savings Demo" or similar

## Caregiver UX rules

- Standard density, normal font sizes
- Clear "You are in caregiver mode" indicator at all times
- Switching to patient view is one click and shows a confirmation
- Every destructive action confirmed
- Audit log of every adjustment (date, before, after, note)

## Data model (initial)

- `caregivers` — auth user
- `patients` — display_name, caregiver_id, settings (font_size, locale, currency)
- `accounts` — patient_id, name, type (checking|savings), balance_cents
- `transactions` — account_id, kind (deposit|withdrawal|fee|adjustment),
  amount_cents, label, posted_at, source (scheduled|code|manual|computed_balance)
- `scheduled_deposits` — account_id, label (e.g. "Social Security"),
  amount_cents, frequency (weekly|biweekly|monthly), anchor_date,
  next_run_at, active
- `deposit_codes` — patient_id, code, amount_cents, kind (check; `workbook`
  retained for historical rows only — ADR 0004), status, used_at,
  transaction_id, workbook_kind (set when the check is a workbook reward)

Money is always integer cents. Never floats.

## Coding standards

- Strict TypeScript (`"strict": true`, no `any` without comment)
- Server Actions for mutations, not REST endpoints, unless an external client needs it
- Zod schemas live next to the action; client and server share them
- Component files: PascalCase. Utility files: kebab-case.
- Co-locate tests as `*.test.ts` next to the file

## Commit message conventions

Each commit is a mini-handoff entry. Assume the next session — yours or
someone else's — has only the commit log to reconstruct intent.

- **Conventional commit prefix:** `feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `test:`. The prefix sets the reader's expectations before
  they read the rest.
- **Imperative mood, present tense.** "add", "fix", "remove" — not
  "added", "fixes", "removing". Reads as an instruction the commit
  carries out.
- **First line ≤72 characters** and summarizes the change. If you can't
  fit it, the commit is probably doing two things — split it.
- **Body explains *why*, not *what*.** The diff already shows what
  changed; the body explains the motivation, the constraint, the
  alternative rejected, or the bug being fixed. Skip the body only when
  the subject line is genuinely self-explanatory.
- **Reference the spec or ADR when relevant.** "Implements M3 spec
  acceptance criterion 3" or "Per ADR 0001, materialize on load" anchors
  the commit to the durable record.
- **Wrap the body at ~72 chars** for readability in `git log`.

## Commands

- `pnpm dev` — local dev
- `pnpm test` — vitest
- `pnpm typecheck` — tsc --noEmit
- `pnpm lint` — eslint
- `pnpm db:push` — drizzle migrations
- Always run `pnpm typecheck && pnpm lint` before declaring a task done

## What NOT to do

- Do not add real banking integrations (Plaid, Stripe, etc.)
- Do not store uploaded check images
- Do not add notifications, emails to the patient, or anything that could
  confuse a person with dementia
- Do not add gamification to the patient side. The workbook reward is fine
  because the caregiver controls it; do not add streaks, badges, etc.
- Do not introduce client-side state libraries (Redux, Zustand) unless asked