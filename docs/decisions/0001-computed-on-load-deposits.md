# 0001 — Scheduled deposits are computed on load, not by a cron job

## Context

Patients receive recurring "income" (Social Security, pensions, etc.) as
scheduled deposits the caregiver configures once. These need to appear in
the patient's account on the right date so the patient sees a believable
balance when they check. Real banks would post these via batch jobs.
Clearview Savings is deployed on Vercel (serverless, no always-on workers), is built
solo, and has effectively no operational budget for monitoring background
infrastructure.

## Decision

When the patient or caregiver loads any account view, the request handler
runs `materializeScheduledDeposits(patientId)` before rendering. This
walks each active scheduled deposit, creates transaction rows for any
occurrences whose date is `<= now()` and not yet materialized, advances
`next_run_at`, and is fully idempotent. There are no cron jobs, no Vercel
Cron entries, no background workers, no queues.

## Alternatives considered

- **Vercel Cron** — adds an external moving part (cron platform) that can
  silently fail, paged on a Sunday morning. Adds a "did the cron run
  today?" failure mode patients would directly experience as a missing
  deposit. Buys nothing the on-load approach doesn't already provide,
  because patients only care about deposits they can see — and they only
  see them when they load the page.
- **Database triggers / pg_cron** — couples scheduling to the database
  vendor (Supabase today, maybe not forever) and hides logic outside the
  application code where it's easy to forget exists.
- **External worker (Inngest, Trigger.dev, etc.)** — overkill for a solo
  project with no operational team. Another vendor account, another
  failure mode.

## Consequences

**Good:**

- Zero infrastructure to monitor. The deposit pipeline can't fail without
  someone simultaneously failing to load the page — which is a problem
  that already announces itself loudly.
- Determinism: a fresh dev environment shows correct balances the moment
  it's loaded, with no "wait for the cron to catch up" step.
- Trivial to test: integration tests just call the materializer.

**Costs / commitments:**

- The materializer **must be idempotent** and safe under concurrent
  requests (two tabs loading the same account simultaneously must not
  double-post). This is enforced by the `next_run_at` advance happening
  inside the same transaction as the row insert.
- Every account-view route handler must call the materializer at the
  top, before any read. Easy to forget when adding a new view. Mitigation:
  call it from a small number of well-named entry points; PR review
  catches misses.
- A patient who never logs in for two months will see two months of
  back-deposits appear in one go on their next visit. Acceptable —
  that's actually closer to how a real "I haven't checked my balance in
  weeks" feels than a perfectly-up-to-the-minute ledger would be.

## Date

2026-04-15
