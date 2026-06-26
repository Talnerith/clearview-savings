# 0007 — Copy-the-drawing replaces sequencing as the visuospatial page

## Context

Each reading and mixed workbook carried a "putting things in order"
(sequencing) page: the patient renumbers the scrambled steps of a simple
daily task. The difficulty of a sequencing item is fixed by the task
itself — "make a cup of tea" has roughly one inherent level no matter how
the steps are worded — so the grade-0..3 difficulty dial barely moves it.
The caregiver feedback that drives this project asked for a final-page
exercise that actually scales with the grade setting and exercises hand
control, not just recall of step order.

## Decision

Workbooks use a **copy-the-drawing** page in place of sequencing. The
patient is shown a stroke-only reference figure and redraws it in a blank
box beside it. Difficulty scales by grade through figure complexity:

- **Grade 0 (Kindergarten):** single primitives — circle, square,
  triangle, plus, diamond.
- **Grade 1:** simple combined figures — house, star, arrow, hexagon.
- **Grade 2:** two intersecting/overlapping shapes — square with
  diagonals, overlapping circles, six-point star, diamond-in-square.
- **Grade 3:** complex multi-line figures — interlocking pentagons, a
  cube, a one-stroke pentagram, a cylinder, a spoked wheel.

The figures are stored as plain coordinate data (a `ShapeElement[]` in a
fixed `0 0 100 100` space), not pre-rendered SVG strings, so the PDF and
the HTML answer key draw them natively and the `content_seed` snapshot
stays human-readable. The progression mirrors established figure-copying
cognitive tasks (MMSE intersecting pentagons, the Necker cube, clock-style
spokes), which gives the grade ramp a clinical grounding.

`sequencing` is swapped out of `PAGE_SHAPES`; no new sequencing rows are
minted. Its type, JSON bank, and renderers are **retained** so historical
workbooks — whose problems are snapshotted in
`deposit_codes.content_seed` — still print and show answers.

## Alternatives considered

- **Keep sequencing, add copy-shape as an extra page** — rejected: the
  workbook is deliberately short (5 content pages with generous
  whitespace); adding a sixth page works against that, and the ask was to
  *replace* the page that doesn't scale, not pad the book.
- **Make sequencing harder by adding more steps per item** — rejected:
  more steps raises tedium, not graded difficulty, and long step lists
  read poorly for a patient with moderate dementia.
- **Remove the sequencing type and data entirely** — rejected: historical
  workbooks store the full sample in `content_seed`; deleting the renderer
  would break their PDF and answer-key views. Retaining dead-but-rendering
  code is the cost of an immutable content snapshot.
- **Store figures as raw SVG strings** — rejected: opaque in the snapshot
  and not validatable; coordinate data lets the bank-sanity test bound
  every point to the viewBox.

## Consequences

- **Unlocked:** a workbook page whose difficulty genuinely tracks the
  grade dial, plus hand-control / visuospatial practice the other pages
  don't cover. Adding figures is pure data — a new entry in a grade's
  `copy-shape.json`, no code change.
- **Cost / committed to:** the `sequencing` category, bank, and its PDF +
  answer-key renderers are now maintenance-only legacy kept solely for
  historical rows; the `WorkbookCategory` union and every exhaustive
  switch over it carry one more arm.
- **Unchanged:** no DB migration — workbook *category* was never a
  database enum (only `workbook_kind` = math|reading|mixed is). The
  seeded sampler, the `content_seed` snapshot mechanism, the reward-check
  flow (ADR 0004), and per-workbook determinism all keep working as-is.
- Patient-facing label is "Copy the drawing"; the framing rules
  (CLAUDE.md / M3) are unaffected — no clinical vocabulary is introduced.

## Date

2026-06-26
