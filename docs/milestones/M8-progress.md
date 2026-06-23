# M8 progress — workbook revamp (gentler floor + reward-as-check)

**Status: CLOSED 2026-06-06.** All 8 steps shipped and pushed
(`b7f431f`…`6927c22`); migration `0005` applied and verified against the
live database; M8 close-out approved by the user.

Green at close: `pnpm typecheck && pnpm lint && pnpm test --run` —
**285 passed, 42 skipped**; `pnpm build` clean; forbidden-patient-vocab
grep over `app/(patient)` clean.

## Migration 0005 — applied + verified on the live DB (2026-06-06)

`pnpm db:migrate` applied `0005` (0000–0004 skipped, already tracked).
Post-migration `deposit_codes` breakdown confirmed the back-compat
contract: **3** unused workbook rewards converted to `kind = "check"`
(workbook content retained, now redeemable via "Deposit a Check"), **2**
historical *used* rows kept `kind = "workbook"` untouched, **1** plain
check untouched. Unused `kind = "workbook"` remaining: **0** — no
orphaned, unredeemable rewards.

## Done — all 8 steps

| # | Step | Commit |
| - | ---- | ------ |
| 1 | Widen `WorkbookGrade` to `0\|1\|2\|3` + `gradeLabel` | `b7f431f` |
| 2 | Author K + grade-1 banks (5 categories) + bank/sampler tests | `b7f431f` |
| 3 | Grade picker UI (K, Grade 1, default Grade 1) + enum + label | `eec5b21` |
| 4 | Data migration `0005` (unused workbook → check) | `57aca98` |
| 5 | Generation mints `kind="check"`; surfaces split on workbook-ness | `7f3059f` |
| 6 | Reward check as the workbook PDF's final page (shared `CheckPage`) | `dd711bd` |
| 7 | Remove `/patient/[id]/submit-work/**` + calm catch-all fallback | `92bd16a` |
| 8 | CLAUDE.md data-model + rule 5 edit (ADR 0004) + close-out | (this) |

## Decisions / corrections recorded this build

1. **Apply path is `pnpm db:migrate`, not `db:push`.** The M8 plan said to
   confirm `db:push` walks the data migration — but `drizzle-kit push`
   diffs schema and skips a data-only file. The real apply mechanism is
   `scripts/apply-migration.ts` (walks `drizzle/*.sql` by filename, tracks
   in `_b4a_applied_migrations`). `0005` applies there. Journal + a `0005`
   snapshot (0004's schema, fresh id, prevId = 0004.id) keep the next
   `drizzle-kit generate` at idx 6.
2. **Surface separation moved from `kind` to workbook-ness.** Workbooks
   filter `isNotNull(workbook_kind)`; Checks tighten to `kind = "check"
   AND isNull(workbook_kind)`. `redeemCode` is kind-agnostic, so migrated
   and newly minted rewards deposit exactly like a plain check.
3. **Reward check is the workbook PDF's final page**, reusing an extracted
   shared `CheckPage` from `lib/check-pdf` (Open Question 2b, deferred to
   the plan, resolved this way).
4. **Calm 404 fallback added.** There was no `not-found` handler anywhere;
   removing `submit-work` would have surfaced Next's default 404 on a stale
   URL. Added `app/(patient)/patient/[id]/[...slug]/page.tsx` redirecting
   unknown patient sub-paths to the patient home.
5. **Default difficulty = Grade 1** (Kindergarten one click below). The
   feedback was that Grade 2 was too hard; Grade 1 is a gentle default the
   caregiver can lower or raise.

## Tests added

- `bank-sanity.test.ts` — grades 0/1 added + per-category page-shape minimums.
- `sampler.test.ts` — real K/grade-1 banks fill every kind's page shape,
  deterministic, no in-workbook dupes.
- `lib/workbook-reward.test.ts` — runs the real `0005` SQL (unused workbook
  → check, used untouched) and the surface filters (reward on Workbooks
  only, plain check on Checks only) against pg-mem.
- `lib/workbook-pdf.test.tsx` — renders the full workbook to a `%PDF`
  buffer, exercising the shared check page as the final page.
- `lib/deposit-codes.test.ts` — M8 reward (`kind="check"` + workbook
  content) redeems end-to-end; legacy `kind="workbook"` redemption kept
  for back-compat.

## Close-out checklist — done

1. ✅ Batch pushed (`b7f431f`…`6927c22`), deployed.
2. ✅ `pnpm db:migrate` applied `0005`; effect verified on the live DB
   (see the migration section above).
3. ✅ Patient-flow confirmation on the live deploy: generate (Kindergarten
   + Grade 1) → print → deposit the reward check via "Deposit a Check" →
   reward posts once → stale `/submit-work` URL falls back calmly to home.
4. ✅ M8 close-out approved by the user — milestone CLOSED.

## Next

M8 is closed; no code or follow-up remains. Pre-flight the next milestone
with a frozen `docs/specs/M{N}.md` before coding, per CLAUDE.md.
