# Project gotchas

Per `CLAUDE.md`, project-specific gotchas live here so the rules file stays
about design rather than incident history. Each entry should explain WHAT
trips people up and WHY, plus the workaround if one exists.

## Test backend (pg-mem) quirks

The fixture `lib/test/pg-mem.ts` runs drizzle's node-postgres adapter on
top of pg-mem (with `mem.adapters.createPg().Client`). This unlocks
`db.transaction()` — drizzle's pg-proxy adapter explicitly throws on
transactions, so before this swap the entire family of `db.transaction()`
actions was untestable. With the swap, **commit-path tests work**; the
remaining quirks below are real but bounded.

### Quirk 1: `column - $param` mis-evaluates

pg-mem evaluates `UPDATE … SET col = col - $1` to `-(col - $1)` instead
of `col - $1`. Reproduced by direct probe outside drizzle. Addition with
parameters works fine, as does subtraction with inline literals.

**Workaround:** in any code that runs in tests, write
`col + ${-amount}` instead of `col - ${amount}`. Postgres evaluates both
identically, so production behavior is unchanged. See
`lib/transfers/transfer.ts` — the from-leg balance update uses this
form.

### Quirk 2: `ROLLBACK` is a no-op for inserted rows

`BEGIN` / `INSERT` / `ROLLBACK` leaves the inserted row present. Real
mid-transaction-rollback atomicity (the spec acceptance criterion's
"a transfer that fails mid-operation leaves zero transactions written")
cannot be verified on pg-mem.

**Workaround:** the transfer atomicity tests verify the related
GUARD-ORDER invariant — validation throws happen BEFORE any insert, so
no rows are written when input is bad. The "happy path commits both
legs + audit row" test passes correctly (commit works). A canary test
in `lib/transfers/transfer.test.ts` asserts the limitation positively
so we'll be flagged the day pg-mem's behavior changes; at that point
the guard-ordered tests can graduate to true atomicity tests via
mid-transaction failure injection.

### Quirk 3: stripping `types` and `rowMode` from query configs

drizzle's node-postgres adapter attaches per-query `types`
(custom type parsers) and sets `rowMode: 'array'` (positional rows for
its `mapResultRow` logic). pg-mem refuses both with
`"getTypeParser is not supported"` / `"pg rowMode is not supported"`.

**Workaround:** the test fixture's `adaptQuery` strips both before
forwarding. After the query runs, the wrapper converts each row to
positional form via `Object.values(row)` (pg-mem returns object keys in
column order, so this preserves position). pg-mem already returns
native JS values for the column types we use, so drizzle's per-query
parsers aren't doing anything load-bearing here.

### Quirk 4: pg-mem's `Pool` ≠ pg's real `Pool`

drizzle does `this.client instanceof Pool` (against pg's real
`Pool` class) to decide whether to acquire a dedicated connection
inside `db.transaction`. pg-mem's `Pool` emulator does NOT extend pg's
`Pool`, so the check returns false and drizzle would skip connection
acquisition — meaning BEGIN/COMMIT/ROLLBACK would have no isolation
effect (each query auto-commits via the pool's per-query session).

**Workaround:** the test fixture passes a `Client` (not a `Pool`) to
drizzle. drizzle treats a Client as the single session and runs every
transaction query (including BEGIN/COMMIT/ROLLBACK) through it.
Single-client serialization is fine for in-memory tests.

## Long-term fix path

The two non-cosmetic quirks (#1 and #2) are pg-mem evaluator bugs.
Fixing them requires either:

- Filing issues upstream and waiting for a release.
- Switching the test backend to a real Postgres via testcontainers.
  Heavier infrastructure but makes BEGIN/COMMIT/ROLLBACK and arithmetic
  evaluation truly correct. Could be added alongside the existing
  pg-mem fixture for the small subset of tests that need real
  transactions.

Either is its own milestone-sized chore; not in M4 scope.
