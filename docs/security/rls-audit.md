# RLS audit — M5 Step 8

> See also: [`docs/security/auth-hardening.md`](./auth-hardening.md)
> for the auth-surface protection stack (Vercel Edge → per-IP
> limiter → per-email lockout → Cloudflare Turnstile → Supabase Auth
> internal limits). This document picks up once a request has passed
> authentication.

Audit date: 2026-05-16. Policies file audited: `supabase/policies.sql`
after this milestone's revision. Schema audited: `lib/db/schema.ts`
(seven tables: `caregivers`, `patients`, `accounts`, `transactions`,
`scheduled_deposits`, `deposit_codes`, `audit_log`).

## Production enforcement model

Authorization in Clearview Savings is enforced at **two layers**.
Understanding which layer does what matters for reading the rest of
this document.

**Layer 1 — application code (primary).** Every caregiver-side
query passes through `getCurrentCaregiver()` (`lib/auth/current-
caregiver.ts`) and, where a patient is in scope,
`getPatientForCaregiver(patientId)` (`lib/auth/require-patient.ts`).
The patient row is fetched with an explicit
`where caregiver_id = <current>` clause; on mismatch the route
redirects rather than rendering. Every downstream query is then
scoped through the patient or caregiver id. This is the gate that
holds in production today.

**Layer 2 — Postgres RLS (defense-in-depth).** The policies in
`supabase/policies.sql` mirror the same ownership chain at the
database level. They activate only when the connection is made by
a non-superuser role through the PostgREST / `@supabase/ssr` /
`@supabase/supabase-js` data path — none of which the application
currently uses for queries. The app reads and writes through
`lib/db/index.ts`, a direct `postgres-js` connection to Supabase's
session pooler that connects as the `postgres` superuser, which has
the `BYPASSRLS` attribute. RLS does not fire on those queries.

That posture is deliberate. The RLS policies exist so that if a
future feature reaches for the Supabase JS client (a common pattern
for browser-side reads or for Realtime subscriptions), the
authorization story doesn't silently regress to "whatever the
caller asked for." The integration tests in this milestone are the
green check that the policies do the right thing the day that
happens.

**Patient route.** `app/(patient)/patient/[id]/page.tsx` and the
deposit/submit-work flows below it are intentionally unauthenticated
— the patient never signs in. The patient UUID in the URL is the
sole capability gate. Those queries also go through the same `db`
connection, so they also bypass RLS; the UUID is opaque and is not
enumerable. This is the M1 design and is unchanged by this audit.

## Per-table policy walkthrough

For each public table, the policy below applies `for all to
authenticated` — i.e., it gates SELECT, INSERT, UPDATE, and DELETE
for any non-superuser session in the `authenticated` Postgres role.
Service-role connections (used by `scripts/seed.ts` — see service-role
section) bypass RLS by virtue of their role, not by an `OR`-out in
the policy.

| Table                  | Policy                       | USING / WITH CHECK scope clause                                                                  | Verdict |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| `caregivers`           | `caregivers_self`            | `user_id = auth.uid()`                                                                           | ✓       |
| `patients`             | `patients_owner`             | `caregiver_id in (select id from caregivers where user_id = auth.uid())`                         | ✓       |
| `accounts`             | `accounts_owner`             | `patient_id in (select p.id from patients p join caregivers c on c.id = p.caregiver_id ...)`     | ✓       |
| `transactions`         | `transactions_owner`         | `account_id in (select a.id from accounts a join patients p ... join caregivers c ...)`          | ✓       |
| `scheduled_deposits`   | `scheduled_deposits_owner`   | same chain as `transactions` via `account_id`                                                    | ✓       |
| `deposit_codes`        | `deposit_codes_owner`        | same shape as `patients_owner` via `patient_id`                                                  | ✓       |
| `audit_log`            | `audit_log_owner`            | `caregiver_id in (select id from caregivers where user_id = auth.uid())`                         | ✓ *    |

\* `audit_log_owner` is new in this audit. Before the revision in
this milestone, `audit_log` had no policy and RLS was not enabled on
the table at all. See "Findings" below.

The same scope clause is used for both `USING` (read / update-target
filter) and `WITH CHECK` (insert / update-result filter), which
means a caregiver cannot insert a row that references another
caregiver's child entity. This symmetry is the property the
cross-tenant integration tests pin down.

## Findings

### Finding 1 — `audit_log` had no RLS policy (fixed in this audit)

`supabase/policies.sql` enabled RLS on six tables and authored six
policies. The seventh table, `audit_log` (introduced in M4), was
omitted. With RLS disabled and no policy, an `authenticated`-role
query against `audit_log` would have read every caregiver's audit
rows.

The application layer was already scoping every audit-log read by
caregiver id, so production was never exposed — but the
defense-in-depth posture for `audit_log` was missing. Fixed in this
milestone:

- `alter table public.audit_log enable row level security;`
- `create policy audit_log_owner on public.audit_log for all to authenticated using (caregiver_id in (select id from public.caregivers where user_id = auth.uid())) with check (...);`

Cross-tenant integration test exercises the fix.

### Finding 2 — RLS is dormant in production (documented, no fix needed)

As described in "Production enforcement model" above, the production
DATABASE_URL connects as the `postgres` superuser via the session
pooler. RLS does not fire on those queries. This is intentional and
matches the application's layered design.

The risk this carries is that a future contributor reaches for the
Supabase JS client (e.g., Realtime subscriptions, browser-side reads)
without realizing the application layer is the gate. The integration
test in `lib/security/rls-cross-tenant.real.test.ts` provides the
safety net: it spins up real Postgres, applies the policies as the
production data path would experience them, and asserts every
cross-tenant attempt fails. If a future change inadvertently relies
on RLS being correct, that test answers whether it is.

No code change required. Documented here so the next contributor
finds it.

## Service-role / privileged-DB call sites

A grep for `SUPABASE_SECRET_KEY`, `service_role`, and `service-role`
across the repo turns up **one** code-level call site:

### `scripts/seed.ts` — dev only, never reached by a request

The seed script uses `SUPABASE_SECRET_KEY` for two purposes:

1. `supabase.auth.admin.{listUsers, createUser, updateUserById}` to
   create or refresh the demo caregiver in Supabase Auth. The Admin
   API requires a service key.
2. Direct `postgres-js` connection to insert demo data.

Neither path is reachable from a deployed request handler. The
script is invoked manually via `pnpm seed` against `.env.local` and
is never imported by application code.

### Direct DB connection (`lib/db/index.ts`) — every code path

The application's `db` import is a `postgres-js` connection using
`DATABASE_URL`. In production this resolves to the Supabase session
pooler (port 5432) authenticating as the `postgres` superuser. This
connection bypasses RLS for every query, including queries from the
patient route group.

The authorization gate for these queries is the application layer
(`getCurrentCaregiver()`, `getPatientForCaregiver()`, explicit
`where caregiver_id` and `where patient_id` filters in route
handlers and lib helpers). The cross-tenant integration test
exercises a separate connection that does honor RLS, so this audit
trail can flag a future regression even though production isn't
gated by RLS today.

### No request-handler use of the service role

Route handlers in `app/api/`, server actions, and the patient route
group do not import `SUPABASE_SECRET_KEY`. The middleware
(`lib/supabase/middleware.ts`) and server client
(`lib/supabase/server.ts`) use the publishable key, which carries
the user's JWT in cookies. The publishable key has no RLS bypass.

## Test coverage

Two integration tests land alongside this audit:

- `lib/security/rls-cross-tenant.test.ts` — runs against pg-mem
  with the same scope-clause shape exercised at the SQL level. pg-
  mem does not enforce RLS natively, so this test pins down the
  *shape* of the policy filter (the same `WHERE` clause an RLS
  USING clause expands to) rather than RLS engine behavior. Runs
  in default `pnpm test --run`.
- `lib/security/rls-cross-tenant.real.test.ts` — runs against a
  real Postgres 15 container via `@testcontainers/postgresql`.
  Loads drizzle migrations, the `auth.uid()` stub, and
  `supabase/policies.sql`, then runs the same matrix as the
  `authenticated` role with `SET LOCAL request.jwt.claim.sub`
  switching identities. This is the test with real teeth — it
  exercises Postgres's actual RLS engine. Gated by
  `RUN_REAL_POSTGRES_TESTS=1` so CI without Docker still passes;
  runs locally on Docker Desktop.

Both tests assert, for caregivers A and B with independent owned
chains: every SELECT / UPDATE / DELETE by A against B's rows
returns zero rows (or fails for INSERTs that violate the
`WITH CHECK` clause), and the same in reverse. Roughly 56
assertions total per file.

## Conclusion

The seven-table policy set is internally consistent: each policy
expresses the same ownership chain that the schema's foreign keys
encode, both `USING` and `WITH CHECK` use identical scope clauses,
and the new `audit_log_owner` policy closes the only gap. Cross-
tenant integration coverage is in place at both the SQL-shape and
real-Postgres levels.

Production authorization continues to be enforced by the
application layer; RLS remains the durable defense-in-depth that
catches the day a future feature reaches for the data path that
would otherwise bypass that layer.
