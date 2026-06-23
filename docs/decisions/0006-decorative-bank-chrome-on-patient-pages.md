# 0006 — Decorative bank chrome on patient pages

## Context

M9's spec listed busy bank chrome (sidebar navigation, profile menus,
promo panels) as a non-goal: "chrome that adds cognitive load and
dead-end taps for a patient with dementia." The field test went the
other way. At the round-2 visual review (2026-06-11) the user reported
that his father senses the site is not real precisely because it is too
sparse: "Real bank websites look busy — there's a lot of options left
and top." For this product, believability *is* the therapeutic payload;
a calm page that reads "fake" fails at the one thing it exists to do.
The user asked for busy-ness simulated "without any real interaction."

## Decision

Patient pages carry decorative bank chrome: a nav strip under the
header and an information rail beside the main content. Only controls
that lead somewhere real are interactive ("My Accounts", "Deposit a
Check" in the nav). Everything else is set dressing — non-interactive
elements (plain spans, default cursor, no hover feedback) that are
`aria-hidden` so assistive tech never offers a dead control. Panel
*text* is always truthful ("You have no new messages", a security
reminder); fake items are only ever *labels* ("Statements", "Order
Checks"), never claims.

## Alternatives considered

- **Keep the sparse layout (the spec non-goal)** — rejected by field
  evidence: the patient himself flags the site as not real.
- **Make every nav item a safe link** (e.g., "Statements" routing
  home) — rejected: clicking "Statements" and landing on the home page
  is a confusing dead-end tap, worse than a click that simply does
  nothing; it also contradicts the user's explicit "without any real
  interaction."
- **Calm static pages for each item** ("Statements are mailed to
  you…") — rejected for now: each page is new patient-visible surface
  to keep vocab-clean and believable, for marginal extra realism.
  Revisit if the decorative items themselves cause confusion.

## Consequences

- The patient view reads dense like real online banking; "one primary
  action per screen" still holds because decorative items are not
  actions — "Deposit a Check" remains the only call-to-action.
- A click on a decorative item does nothing. That is the accepted
  trade-off; if observation shows this frustrates patients, the
  fallback is the calm-static-pages alternative above.
- Decorative labels are patient-visible strings: they must stay in the
  forbidden-vocab grep scope and must never name real-bank proprietary
  products ("EasyWeb", "Interac e-Transfer", "Zelle").
- No deposit-insurance or regulatory claims (CDIC/FDIC) may ever
  appear in decorative panels — that would cross from set dressing
  into impersonation (ADR 0002 territory).

## Date

2026-06-11
