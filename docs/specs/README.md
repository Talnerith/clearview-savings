# Milestone specs

Every milestone gets a **spec written BEFORE coding starts**. Not after.
Not "as we go." The spec is the planning contract: it forces us to name
the goal, draw the boundary, list what won't be built, and surface the
hard questions while there's still time for the answers to change the
shape of the work.

## What a spec is

A spec is a short pre-flight document, one per milestone, at
`docs/specs/M{N}.md`. Use `TEMPLATE.md` as the starting point. Sections:

- **Goal** — one sentence
- **Scope** — what's in
- **Non-goals** — what's deliberately out (often more important than
  scope; this is where you prevent next month's "wait, I thought we were
  building X")
- **Acceptance criteria** — a checklist someone could verify against the
  running app
- **Open questions** — things that need an answer before code can be
  written, and who needs to answer them
- **Risks** — what could derail this milestone

## What a spec is NOT

- A design doc — implementation choices, file maps, and step-by-step
  build plans live in `docs/milestones/M{N}.md`
- A status report — current progress lives in
  `docs/milestones/M{N}-progress.md`
- A retrospective — decisions made during implementation that change the
  plan are captured in the milestone doc or as ADRs in `docs/decisions/`,
  not by editing the spec after the fact

## Lifecycle

The spec is **frozen** once coding starts. If reality forces a change
mid-milestone — scope grew, a non-goal moved into scope, an acceptance
criterion turned out to be wrong — record the deviation in the milestone
doc or progress doc rather than rewriting the spec. The whole point of
freezing it is to make scope drift visible.

A spec being "wrong in retrospect" is fine and useful — it tells future
milestones what kind of unknown bit us this time.

## Relationship to other docs

- `docs/specs/M{N}.md` — pre-flight contract (this folder; immutable)
- `docs/milestones/M{N}.md` — implementation plan + design decisions made
  along the way (mutable)
- `docs/milestones/M{N}-progress.md` — current handoff state (mutable)
- `docs/decisions/` — ADRs, one per real architectural decision (immutable)
