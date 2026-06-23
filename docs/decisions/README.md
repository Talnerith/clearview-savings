# Architecture Decision Records (ADRs)

This folder records the **why** behind real architectural and non-obvious
decisions in Clearview Savings. One file per decision. Written **at the moment the
decision is made**, never retroactively — a decision rationalized after
the fact loses the alternatives that were actually on the table.

## What belongs here

A decision belongs in an ADR if a future contributor (including future-you)
would reasonably ask "why did we do it this way?" and the answer isn't
obvious from reading the code. Examples:

- A choice between two viable libraries, patterns, or data shapes
- A constraint imposed by the patient-UX rules that shaped a technical choice
- A deliberate non-decision (e.g. "we are not adding a cron job")
- A trade-off where the runner-up was close enough that someone might
  later try to "fix" the chosen path

## What does NOT belong here

- Bug fixes, refactors, or routine implementation work — the commit
  message is the right place
- Project rules that apply universally — those go in `CLAUDE.md`
- Per-milestone scope and plans — those live in `docs/milestones/M{N}.md`
- Per-session progress — handoff docs at `docs/milestones/M{N}-progress.md`

## Format

- One file per decision: `NNNN-short-title.md` where `NNNN` is the next
  unused 4-digit number (`0001`, `0002`, …)
- Use `TEMPLATE.md` as the starting point
- Sections: **Context, Decision, Alternatives considered, Consequences, Date**
- Keep it short. An ADR is usually under a page. The point is the
  reasoning, not the prose.

## Lifecycle

ADRs are **immutable once written**. If a decision is later reversed or
superseded, write a new ADR that references the old one. Do not edit the
old one. The history of "why we thought X, then changed our mind" is the
value.
