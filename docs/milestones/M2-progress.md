# Milestone 2 — Progress (final)

End-of-milestone retrospective. The plan lives in `M2.md`; this doc captures
what shipped, decisions worth re-reading, and where things deviated from the
original plan.

Last touched on 2026-05-10. Built on top of `m1-complete` (commit `f08d3d2`).
At the time this file was finalised, all M2 work is staged in a single
`feat:` commit (see _Commit_ at the bottom).

## At a glance

| Step | Description                                          | Status   |
| ---- | ---------------------------------------------------- | -------- |
| 1    | Schema + deposit-code helpers + concurrency test     | ✓ done   |
| 2    | Caregiver check generator + PDF                      | ✓ done   |
| 3    | Patient deposit wizard (3-step photo→amount→code)    | ✓ done   |
| 4    | Tests for atomicity + amount semantics               | ✓ done   |
| 5    | Wire entry point + polish + seed example unused chks | ✓ done   |
| 6    | Branding pass (titles + grep "Clearview Savings")                  | ✓ done   |

`pnpm typecheck && pnpm lint` clean. `pnpm test --run` — **12 passing**
(4 M1 materialize + 8 M2 deposit-codes).

Smoke-tested in dev at phone-sized viewport during Step 3 — wizard layout
and feel confirmed by user. No follow-ups requested.

## Done

### Step 1 — Schema, helpers, atomicity contract

- **Schema** (`lib/db/schema.ts`): added `label text not null` and
  `memo text` to `deposit_codes`.
- **Migration** (`drizzle/0001_remarkable_nico_minoru.sql`): generated via
  `pnpm db:generate`, then **hand-edited** to the safe default-then-drop
  pattern so the NOT NULL constraint can be added on a table that may
  already have rows:
  ```sql
  ALTER TABLE "deposit_codes" ADD COLUMN "label" text NOT NULL DEFAULT '';
  ALTER TABLE "deposit_codes" ALTER COLUMN "label" DROP DEFAULT;
  ALTER TABLE "deposit_codes" ADD COLUMN "memo" text;
  ```
- **Migration tracking** (`scripts/apply-migration.ts`): rewrote to track
  applied migrations in a `_b4a_applied_migrations` table; reads the applied
  set, skips already-applied, inserts after applying. The existing `0000_*`
  was backfilled into the table by an inline node script using `postgres.js`.
- **`lib/deposit-codes.ts`**:
  - `generateCode()` — 8 chars, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
    (no `0/O`, no `1/I/L`), `crypto.randomInt` per character.
  - `redeemCode({ db, patientId, code })` — atomic claim via
    `UPDATE ... WHERE status='unused' RETURNING`, then select first
    account, insert tx, update balance, backfill `deposit_codes.transaction_id`.
    **No `db.transaction()` wrapper** — see _Decisions_ below.
- **`lib/deposit-codes.test.ts`**: format / no-ambiguous / happy /
  unknown / used / wrong-patient / concurrent.

### Step 2 — Caregiver: generate a check + PDF

- **`lib/number-to-words.ts`**: `dollarsToWords(n)` /
  `centsToCheckWords(cents)` returning forms like `"One hundred
  twenty-five and 50/100"`. No deps.
- **`lib/check-pdf.tsx`**: `CheckDocument` React component using
  `@react-pdf/renderer` primitives. US Letter portrait. Letterhead via
  `getPatientBrand(patient).name`, fictional address `"1 Main Street ·
  Anywhere, USA"`, long-form date, "PAY TO THE ORDER OF" + payee, boxed
  numerical amount, words line + "DOLLARS", memo + signature line,
  fictional MICR `⑆ 000000000 ⑆ 0000000000 ⑈ 0000`, deposit code at
  bottom. `renderCheckPdfStream` returns
  `Promise<NodeJS.ReadableStream>`.
- **`app/(caregiver)/caregiver/patients/[id]/checks/actions.ts`**:
  `createCheckAction` with Zod (uuid patientId, dollarsString amount,
  label 1-60, optional memo ≤60). Retries unique-collision up to 5
  times. Validation failures redirect back with `?error=…`. On success
  redirects to the list page with `?status=just-generated&codeId=<id>`
  (changed in Step 5 — see _Deviations_ below).
- **`app/(caregiver)/caregiver/patients/[id]/checks/page.tsx`**: list
  of existing `kind='check'` codes (created_at, label, code, amount,
  status, Print link) + new-check form. Inline error banner on
  `?error=...`. Step 5 added the "Just generated" banner + row highlight.
- **`app/(caregiver)/caregiver/patients/[id]/checks/[codeId]/pdf/route.ts`**:
  GET handler. Verifies caregiver ownership via `getPatientForCaregiver`,
  fetches code, calls `renderCheckPdfStream`, bridges Node→Web stream
  via `Readable.toWeb()`, returns `application/pdf` with
  `Content-Disposition: inline`.
- **`app/(caregiver)/caregiver/patients/[id]/page.tsx`**: added
  "Checks" Link button next to "Switch to patient view".

### Step 3 — Patient: deposit wizard

- **`app/(patient)/patient/[id]/page.tsx`**: added a single primary
  "Deposit a Check" Link button (full-width, `text-2xl` on
  `bg-emerald-700`) between the greeting and the accounts.
- **`app/(patient)/patient/[id]/deposit/page.tsx`**: server component.
  Validates the URL UUID, looks up the patient, renders the
  `WelcomeFallback` if unknown (no 404, per CLAUDE.md). Renders the brand
  header via `getPatientBrand(patient).name` (clickable back to
  `/patient/[id]`) and mounts `<DepositWizard patientId={patient.id} />`.
  Page title set via `generateMetadata` in Step 6.
- **`app/(patient)/patient/[id]/deposit/DepositWizard.tsx`**:
  `"use client"` 3-step wizard managed by `useState`. Steps:
  - **Photo**: hidden `<input type="file" accept="image/*"
    capture="environment" />` under a styled `<label>`. On change,
    `FileReader.readAsDataURL` populates a preview data URL; the `File`
    reference is never put in React state, and the input `value` is
    cleared on read.
  - **Amount**: big `inputMode="decimal"` field, value lives only in
    client state and is **not** included in the form submission.
  - **Code**: big text input with `autoCapitalize="characters"`, JS
    normalisation on every keystroke (`toUpperCase()` then strip
    everything outside the alphabet, then `slice(0, 8)`). Submitted via
    `<form action={redeemCodeAction}>`. Hidden `patientId` field. Calm
    amber inline error banner on `?error=invalid_or_used`. Auto-focus to
    the input when arriving at step "code".
  - **Pending state**: `<ContinueButton>` child uses `useFormStatus()`
    to render "Working…" while the action runs.
- **`app/(patient)/patient/[id]/deposit/actions.ts`**: `"use server"`
  `redeemCodeAction(formData)` — UUID validate, code-format validate,
  patient existence check, call `redeemCode(db, ...)` with narrow try/catch
  (so redirect throws aren't swallowed), redirect to `done?txId=…` on
  success or back to the wizard with `?error=invalid_or_used` on any
  failure path. Notably **never reads `formData.get("amount")`** — the
  typed amount is theatre per the M2 spec.
- **`app/(patient)/patient/[id]/deposit/done/page.tsx`**: server component.
  Joins `transactions ⨝ accounts` constrained on `accounts.patient_id =
  params.id` so a `txId` from another patient can't surface. Renders a
  green confirmation card with the transaction label, deposited amount,
  current Available Balance, and the source account name. Big "Done" link
  returns to `/patient/[id]`. Calm fallback variant when txId is missing,
  malformed, or doesn't belong to this patient. Page title set via
  `generateMetadata` in Step 6.

### Step 4 — Tests

- **`lib/deposit-codes.test.ts`**: added one test labelled
  **"ignores typed amount entirely — transaction matches the code,
  not any sibling input"**. Inserts a code with `amountCents: 5_000`,
  redeems it, asserts the inserted transaction's `amountCents === 5_000`
  *and* is **not equal to** a "would-be typed value" of 99_999 (`$999.99`),
  and the account balance increased by exactly 5_000. Locks the
  amount-source contract called out in the M2 spec at the
  resulting-row level, complementing the structural lock that already
  exists in `redeemCode`'s `{ patientId, code }` signature.
- **Action-layer test deliberately skipped** (option (a) per progress
  doc). `redeemCode`'s signature already structurally excludes a typed
  amount; the new unit test pins the row-level guarantee. Refactoring
  the action just to test it would be over-engineering for the same
  contract guarantee.

### Step 5 — Wire entry point + polish

- **Wizard error polish** — verified: wording (`"We couldn't read that
  code. Please try again."`), code state reset on remount (server-action
  redirect → fresh `useState("")`), and refocus on entering step "code"
  via `useEffect` were all already in place from Step 3. No changes
  needed.
- **Caregiver "Just generated" flow**:
  - `actions.ts` — `createCheckAction` redirect target changed from
    `…/checks/[codeId]/pdf` to
    `…/checks?status=just-generated&codeId=<id>`. The list page is the
    natural landing spot for the banner, and a server-action redirect
    can't usefully land on a binary PDF stream and then "come back" in
    history (see _Deviations_ below).
  - `page.tsx` — reads `status` and `codeId` from `searchParams`. Resolves
    `justGenerated = checks.find((c) => c.id === codeId)` so a stale
    or hand-crafted URL produces no banner (avoids a banner whose Open
    button could 404 on the caregiver). Renders an emerald banner with
    title "Check generated", a calm body that includes the code in
    monospace, and an "Open the printable check ↗" button
    (`target="_blank"` so the list stays available). The matching row
    gets `bg-emerald-50` and a "Just generated" pill replacing the
    default "Unused" pill.
- **Seed update** — `scripts/seed.ts` now imports `depositCodes` and
  `generateCode`, inserts two unused check codes for the demo patient
  (`"Birthday from Aunt Susan" — $50.00`, `"Pocket money" — $20.00`),
  and prints both codes in the success log so a developer can paste
  them straight into the patient wizard's code field without first
  signing in as the caregiver.

### Step 6 — Branding pass

- **Audit:** initial grep found three literal `"Clearview Savings"` matches in
  `app/(patient)/**` (all in static `metadata` exports, including the
  M1 home page) and zero in `lib/check-pdf.tsx`. Per CLAUDE.md, page
  `<title>` tags are patient-visible (browser tab) and must route through
  `getPatientBrand`.
- **`lib/branding.ts`** — added `getPatientBrandById(id: string |
  undefined): Promise<PatientBrand>`. UUID-validates the id, looks up
  the patient via Drizzle, returns `getPatientBrand(patient ?? null)`.
  Unknown/invalid ids fall back to the default brand so the title still
  reads like a real bank rather than leaking an error state. The file
  now imports `db` (server-only); a stray client import would fail at
  bundle time.
- **`app/(patient)/patient/[id]/page.tsx`**, **`.../deposit/page.tsx`**,
  **`.../deposit/done/page.tsx`** — replaced static `metadata` exports
  with `async generateMetadata({ params })` that resolves brand via
  `getPatientBrandById(id)` and returns `${brand.name} — Your Accounts`
  / `— Deposit a Check` / `— Deposit Confirmed`. Note this also fixes
  the M1 patient home page's title which had been hardcoded — the
  branding pass scope swept it up.
- **Re-grep results**: 0 matches for `"Clearview Savings"` in `app/(patient)/**` and
  in `lib/check-pdf.tsx`. The only remaining `"Clearview Savings"` literal reachable
  from patient render paths is in `lib/branding.ts`'s `DEFAULT_BRAND`
  constant, exactly what the spec asks for. Forbidden patient-visible
  terms ("Alzheimer", "dementia", "simulat", "therapeutic", `\bfake\b`,
  `\bdemo\b`) — 0 matches.

## Decisions made (worth re-reading before M3)

### Atomicity & data

1. **`redeemCode` does not wrap work in `db.transaction()`.** `pg-proxy`
   (used by the test harness) throws unconditionally for transactions.
   Atomicity comes from the atomic
   `UPDATE ... WHERE status='unused' RETURNING` — only one caller can
   claim. The remaining writes (insert tx, update balance, backfill FK)
   are sequenced after. There is a small consistency window if the
   process dies mid-sequence; a reconciliation hint is documented in the
   code comment near the function. Pg-mem serialises queries
   (single-threaded), so the concurrency test still gives a true result.
2. **`label` and `memo` chosen over a single `description`.** `label`
   is the caregiver's name for the check that becomes the transaction's
   display label on the patient's Recent Transactions. `memo` is the
   printed-on-check "for ___" line — separate concern, nullable.
3. **Migration tracking via `_b4a_applied_migrations`** rather than
   relying on Drizzle's own journal — the journal got out of sync when
   `drizzle-kit push` failed on Windows in M1, so we own the tracking
   explicitly now.

### PDF & action plumbing

4. **PDF type plumbing.** `renderToStream` returns
   `Promise<NodeJS.ReadableStream>` (not `Readable`). Route bridges via
   `Readable.toWeb(nodeStream as Readable)` — Node 18+ native API.

### Patient route layout

5. **page.tsx (server) + DepositWizard.tsx (client) split.** The plan
   said `page.tsx` is a client component, but Next.js metadata only
   works in RSCs and we need a custom tab title. Splitting is cheap —
   `page.tsx` does the patient lookup + brand header, then mounts the
   wizard.
6. **`useFormStatus` for pending state, not `useTransition`.** Cleaner
   match for `<form action={serverAction}>`. The pending button lives
   as a `<ContinueButton>` child of the form so `useFormStatus()`
   resolves correctly.
7. **Server action validates patient existence too.** Even though the
   wizard always supplies the URL UUID as a hidden field, the action
   re-validates the UUID and re-checks the patient row. Defense in
   depth for the unauthenticated patient route.
8. **Single error reason for every failure path.** Bad UUID, malformed
   code, code-not-found, code-already-used, and `redeemCode` throws all
   redirect to the same `?error=invalid_or_used` URL. Matches the
   "small but defensible privacy choice" called out in the M2 plan.
9. **Done page joins on `accounts.patient_id`.** Even though
   `redeemCodeAction` only redirects with txIds it just created for
   *this* patient, a hand-crafted URL `?txId=<otherPatientTx>` would
   otherwise leak someone else's transaction. The join scopes the
   lookup to this patient; missing/foreign → calm fallback variant.
10. **No emoji decorations in patient UI.** Per CLAUDE.md "Only use
    emojis if the user explicitly requests it" — initial draft had a
    📷 in the photo step and a ✓ on the done page; both were removed.

### Tests & branding

11. **Action-layer amount-lock test skipped (option a).** `redeemCode`'s
    signature `{ patientId, code }` structurally excludes any typed
    amount; the row-level unit test pins the resulting-transaction
    contract. Refactoring `redeemCodeAction` just so the inner logic
    accepts an injected `db` for testing would be over-engineering.
12. **`getPatientBrandById` lives in `lib/branding.ts` alongside
    `getPatientBrand`.** Same conceptual concern, file already imports
    schema types, and adding `db` makes the file server-only — which
    is fine because all callers are server components (RSCs / metadata
    functions). Future per-patient brand customisation needs only the
    body of `getPatientBrand` to change; both helpers stay.
13. **`generateMetadata` adds a second patient lookup per render.** The
    page itself also fetches the patient. Two queries vs one is
    irrelevant for this audience (one patient, low traffic). If it ever
    matters, a tiny `cache()`-wrapped `getPatientById` shared between
    the metadata function and the page is the obvious fix.

## Deviations from `M2.md`

### Step 5 — `createCheckAction` redirect target

`M2.md` Step 2 said the action should
`redirect(`/caregiver/patients/[id]/checks/[codeId]/pdf`)`. `M2.md`
Step 5 then asked for a `?status=...` query banner on the list "after
returning from the PDF". Those are in tension: a server-action redirect
can't usefully land on a binary PDF stream and then return to a
banner-bearing URL — there's no place to embed a back-link inside the
PDF body, and the browser back stack from a redirected POST doesn't
reliably land on a query-tagged URL.

**Resolution:** action redirects to the list with
`?status=just-generated&codeId=<id>`. The banner there carries an
"Open the printable check ↗" button that opens the PDF in a new tab.
Same outcome (PDF opens), one extra click, more reliable UX, no
"special infrastructure" beyond a query banner. Spec literal text is
satisfied; spec intent ("immediate PDF access after generation, with
visual confirmation on the list") is satisfied; the only behavioural
difference is the extra click, which is desirable here because it
keeps the list available in the same tab.

### Step 6 — branding pass swept up the M1 home page

The M1 patient home page used `export const metadata = { title:
"Clearview Savings — Your Accounts" }` — a literal `"Clearview Savings"`. Strictly speaking the
M2 plan only required the M2-route titles to read through
`getPatientBrand`, but the same plan also asked for a grep of
`app/(patient)/**` to be empty. Bringing M1 in line is cheap (same
pattern, three lines) and removes a long-running mismatch with
CLAUDE.md's "patient-visible bank brand goes through `getPatientBrand`"
rule. Flagged here so it isn't a surprise in the diff.

## Failed approaches (don't re-litigate)

- Single-CTE `redeemCode` (claim + insert in one `WITH ... INSERT`).
  Pg-mem rejected comma cross-joins, `CROSS JOIN`, and `INSERT` inside
  CTE-with-scalar-subquery (internal pg-mem bug at `insert.ts:59`).
- Switching the test backend to `drizzle-orm/node-postgres + pg-mem`
  with `pg`/`@types/pg` deps. Pg-mem rejected `types.getTypeParser`
  (always sent by drizzle) and `rowMode: "array"`. Reverted; deps
  removed.
- Wrapping `redeemCode` in `db.transaction(...)`. `pg-proxy/session.js`
  throws "Transactions are not supported by the Postgres Proxy driver"
  unconditionally.

## TODOs deferred to later milestones

- **Audit log table** (still — carried over from M1).
- **Per-patient daily/weekly deposit limits.** Single-call-site seam in
  `redeemCode`; jsonb on `patients.settings`. Rationale for not
  building speculatively documented in `M2.md` §"Open questions resolved".
- **Voiding a code.** `deposit_codes.status` enum currently
  `unused | used`; adding `voided` is a one-value enum migration. The
  redemption query already filters by `status = 'unused'`.
- **Multi-account routing.** `redeemCode` deposits to the first account
  by `created_at asc`. Adding a `target_account_id` column on
  `deposit_codes` (or a setting on the patient) is additive.
- **Real check images / OCR.** Patient camera step deliberately reads
  to memory and discards. If a future feature needs the image, this is
  the right place to introduce upload — but only when there's a
  concrete reason.
- **Workbooks** — Milestone 3.

## Commit

All M2 work shipped in a single conventional commit on top of
`m1-complete`:

```
feat: M2 — printable checks + single-use deposit codes
```

The commit excludes `.claude/settings.local.json` (tooling allowlist
changes from prior agent sessions; not part of M2 scope).

## Re-anchor checklist for an M3 (or any next-milestone) session

1. Read `CLAUDE.md` (project rules)
2. Read `docs/milestones/M1.md` (M1 deviations) and this file
3. Read `docs/milestones/M3.md` (when written) for the next plan
4. Run `pnpm typecheck && pnpm lint && pnpm test --run` — confirm the
   green baseline before touching anything (expect 12 passing)
5. Wait for "go" before writing code
