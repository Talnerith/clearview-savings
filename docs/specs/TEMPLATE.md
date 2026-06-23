# M{N} — Short title

## Goal

One sentence. What does shipping this milestone make possible that wasn't
possible before? Phrase it from the user's perspective (caregiver or
patient), not the implementer's.

## Scope

What's in. Bullet list of capabilities, screens, or behaviors. Each item
should be small enough to gesture at in one line — if you need a
paragraph, it's two items.

- Capability A
- Capability B

## Non-goals

What's deliberately out. This is the most valuable section — it prevents
"wait, I thought we were building X" two weeks in. Be specific about the
adjacent things that look in-scope but aren't.

- Adjacent capability X — deferred to M{N+1}
- Tempting feature Y — out of scope, may never build

## Acceptance criteria

A checklist someone could verify against the running app. Each item is a
testable statement, not an aspiration. If a criterion can't be checked
without reading the code, rewrite it from the user's seat.

- [ ] Caregiver can do X from screen Y
- [ ] Patient sees Z when condition W
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` is green

## Open questions

Things that need an answer **before code can be written**, and who owns
the answer. If a question is "we'll figure it out as we build," it
belongs in Risks, not here.

- Question 1 — needs answer from: [you / domain expert / external]
- Question 2 — needs answer from: …

## Risks

What could derail this milestone? Technical unknowns, dependencies on
external systems, scope creep pressure points, content-quality bets.
One line each, with a mitigation if there is one.

- Risk 1 — mitigation: …
- Risk 2 — mitigation: …
