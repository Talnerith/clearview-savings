# 0004 — Workbook reward is delivered as a deposited check

## Context

Workbooks were introduced in M3 with a self-contained reward mechanism:
a finished workbook prints a single-use 8-char reward **code**, which the
patient types into a dedicated `/patient/[id]/submit-work` screen to post
the reward to their account. This is enshrined in CLAUDE.md — the
`deposit_codes` data model lists `kind (check|workbook)`, and architecture
rule 5 reads "single-use codes for printed checks **and** workbooks."

Real-use feedback (2026-06-03, the user running workbooks with his father,
who has Alzheimer's): the separate typed-code reward screen is a barrier.
The patient already understands the "Deposit a Check" flow; presenting the
reward as a check the patient deposits the normal way removes a second,
redundant patient-facing mechanism — one of the M8 goals
(`docs/specs/M8.md` Part B).

## Decision

The workbook finished-work reward is delivered **as a check**, not as a
distinct workbook reward code. Generating a workbook produces a
`kind: "check"` deposit code carrying the reward amount; the workbook PDF
presents that check at the end; the patient deposits it through the
existing "Deposit a Check" flow. The patient-facing typed reward-code
path (`/patient/[id]/submit-work` and the `kind = "workbook"` redemption)
is **removed**, not kept behind a toggle.

CLAUDE.md's data-model note and rule 5 are updated to match: single-use
codes back **checks**; the workbook reward is delivered as one of those
checks rather than as its own code kind.

## Alternatives considered

- **Keep the dedicated `submit-work` typed-code reward (status quo)** —
  rejected: it is the exact friction the feedback flagged, and it forces
  the patient to learn two near-identical "enter a code" flows.
- **Make the reward check lower-friction than a normal check** (pre-filled
  or scannable code, skipping the typed-code step) — deferred, not chosen
  here: it would reopen the "don't change the deposit wizard" non-goal and
  is tracked as M8 Open Question 2a. This ADR commits only to "reward is a
  check," not to changing the wizard.
- **Add a caregiver toggle: reward-as-code vs reward-as-check** — rejected:
  CLAUDE.md's anti-configurability stance (cf. ADR 0002) and the patient-UX
  "one mechanism" goal both argue against a per-caregiver branch; a
  toggle doubles the patient-facing surface we are trying to shrink.

## Consequences

- **Unlocked:** one deposit mechanism for the patient; the reward rides
  the flow they already know; the `submit-work` route group and its two
  server actions are deleted (less patient-facing surface to maintain).
- **Cost / committed to:** a data-model reversal — no new `"workbook"`
  `deposit_codes.kind` rows are minted; a one-time migration converts
  every *unused* `kind = "workbook"` row to `kind = "check"` so pre-M8
  rewards stay redeemable, while the `"workbook"` enum value is retained
  for historical (used) rows. The workbook generation action now mints a
  `check`-kind code and the workbook PDF must render that check. CLAUDE.md
  rule 5 and the data-model note change with this ADR (the edit lands with
  the M8 implementation so the rules file never contradicts the code).
- **Unchanged:** the caregiver still generates and reviews workbook
  content (the answer-key view and workbook PDF stay); the single-use
  guarantee still comes from the shared `redeemCode` claim UPDATE; money
  is still integer cents posted exactly once.
- **Supersedes** the relevant clause of the M3-era workbook-reward design;
  does not affect ADR 0001 (computed-on-load deposits) or ADR 0002
  (no per-patient brand).

## Date

2026-06-05
