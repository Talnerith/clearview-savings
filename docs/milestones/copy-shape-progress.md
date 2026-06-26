# Copy-the-drawing workbook page — session handoff

**Status: COMPLETE and committed.** This was a standalone post-M9 change
(not part of any open milestone). It is finished, verified, and committed
on branch `feat/copy-shape-workbook-page` (commit `f8288fb`). Nothing is
half-built. See `docs/decisions/0007-copy-shape-replaces-sequencing.md`
for the durable rationale.

## Done

- `lib/workbook-content/types.ts` — added `CopyShapeProblem` and
  `ShapeElement` types; added `"copy-shape"` to the `WorkbookCategory`
  union and `ProblemByCategory`.
- `lib/workbook-content/grade-{0,1,2,3}/copy-shape.json` — new figure
  banks, 6 problems per grade, stored as `0..100` coordinate data.
- `lib/workbook-content/index.ts` — imported the banks, added the
  `copy-shape` arm to `Bank`/`BANKS`, exported the new types.
- `lib/workbook-content/sampler.ts` — swapped `sequencing` → `copy-shape`
  in the `reading` and `mixed` `PAGE_SHAPES` (counts unchanged: 2 each).
- `lib/workbook-pdf.tsx` — `CopyShapeProblems` renderer drawing figures as
  native `@react-pdf` SVG primitives (Look box → Your-turn box); arrow is
  drawn as SVG (the `→` glyph is outside Times-Roman's Latin-1 range).
- `app/(caregiver)/.../workbooks/[codeId]/answers/page.tsx` — answer key
  renders each reference figure as inline HTML SVG with its caregiver name;
  helper text updated.
- `lib/workbook-content/bank-sanity.test.ts` — `copy-shape` min-size (2)
  plus a validity block (known element types, in-range coordinates).
- `lib/workbook-pdf.test.tsx` — added an end-to-end render test that a
  reading workbook's copy-shape page produces a valid PDF.

## In progress

None.

## Not started

None. Possible *future* (not required) follow-ups, none committed to:
- More figures per grade (pure data — add entries to a `copy-shape.json`).
- Once no unredeemed historical sequencing workbooks remain in production,
  the `sequencing` type/bank/renderers could be deleted; until then they
  must stay for `content_seed` snapshot rendering.

## Decisions made this session

- **Swapped the page, didn't add a sixth** — the workbook is deliberately
  5 short content pages; padding it works against that.
- **Kept sequencing code/data as render-only legacy** — historical
  workbooks snapshot their full content in `deposit_codes.content_seed`;
  deleting the renderer would break their PDFs and answer keys.
- **Figures as coordinate data, not raw SVG strings** — keeps the snapshot
  readable and lets the bank-sanity test bound every point to the viewBox.
- **Difficulty ramp** — single primitives (K) → combined figures (1) →
  intersecting shapes (2) → complex multi-line figures (3), mirroring
  established figure-copying tasks (MMSE pentagons, Necker cube).

## Known issues / TODOs

- No `TODO`/`FIXME` comments were left in code.
- Visual inspection was done only via the automated render test (the PDF
  composes to a valid `%PDF`); a human eyeball of the printed figures
  wasn't possible this session (no PDF rasterizer / browser extension).
  Sample PDFs were generated to a scratch dir during the session but are
  not committed. Worth a quick manual print-preview before wide rollout.

## Exact next step

The change is complete. If anything, generate a workbook from the caregiver
UI (kind = reading or mixed) at each grade and print-preview the
copy-the-drawing page to confirm the figures look right at print size.
Otherwise no further action is required.

## Verification

`pnpm typecheck`, `pnpm lint`, and `pnpm test` (325 passing, 42 skipped)
all green as of this commit.
