import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real-Postgres cross-tenant RLS test. Loads the drizzle migrations and
// supabase/policies.sql against a containerized Postgres 15, then runs
// every cross-tenant assertion as the `authenticated` role with
// auth.uid() switched per-transaction. This is the test with real teeth:
// Postgres's actual RLS engine evaluates USING and WITH CHECK clauses.
//
// Gated by RUN_REAL_POSTGRES_TESTS=1 so CI without Docker still passes;
// runs locally on Docker Desktop.

const SHOULD_RUN = process.env.RUN_REAL_POSTGRES_TESTS === "1";

type Fixture = {
  userId: string;
  caregiverId: string;
  patientId: string;
  accountId: string;
  transactionId: string;
  scheduledDepositId: string;
  depositCodeId: string;
  auditLogId: string;
};

let container: StartedPostgreSqlContainer | undefined;
let sql: ReturnType<typeof postgres> | undefined;
let A: Fixture;
let B: Fixture;

async function applyDrizzleMigrations(s: postgres.Sql): Promise<void> {
  const drizzleDir = resolve(process.cwd(), "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const text = readFileSync(resolve(drizzleDir, file), "utf8");
    const statements = text
      .split("--> statement-breakpoint")
      .map((stmt) => stmt.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await s.unsafe(stmt);
    }
  }
}

async function setupDatabase(s: postgres.Sql): Promise<void> {
  await applyDrizzleMigrations(s);

  // auth.uid() stub: reads from a session-local config setting populated
  // per-transaction. Mirrors Supabase's runtime contract — every policy
  // refers to auth.uid() and that's what the policies file uses.
  await s.unsafe(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid as $func$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        '00000000-0000-0000-0000-000000000000'
      )::uuid
    $func$ language sql stable;
  `);

  // 'authenticated' is the role Supabase's PostgREST switches to before
  // dispatching a request. Policies in supabase/policies.sql grant 'for
  // all to authenticated' — without this role, the policies wouldn't even
  // apply. The role is non-login (we only SET ROLE to it) and lacks
  // BYPASSRLS, so RLS is active under it.
  await s.unsafe(`create role authenticated nologin;`);
  await s.unsafe(`grant usage on schema public to authenticated;`);
  await s.unsafe(`grant usage on schema auth to authenticated;`);
  await s.unsafe(
    `grant execute on function auth.uid() to authenticated;`,
  );
  await s.unsafe(`
    grant select, insert, update, delete
    on all tables in schema public to authenticated;
  `);
  await s.unsafe(`
    grant usage, select on all sequences in schema public to authenticated;
  `);

  const policiesText = readFileSync(
    resolve(process.cwd(), "supabase", "policies.sql"),
    "utf8",
  );
  await s.unsafe(policiesText);
}

async function seedCaregiverChain(
  s: postgres.Sql,
  email: string,
): Promise<Fixture> {
  const userId = crypto.randomUUID();

  const [c] = await s<{ id: string }[]>`
    insert into caregivers (user_id, email)
    values (${userId}, ${email})
    returning id
  `;
  const caregiverId = c!.id;

  const [p] = await s<{ id: string }[]>`
    insert into patients (caregiver_id, display_name)
    values (${caregiverId}, ${`Patient of ${email}`})
    returning id
  `;
  const patientId = p!.id;

  const [a] = await s<{ id: string }[]>`
    insert into accounts (patient_id, name, type, balance_cents)
    values (${patientId}, 'Checking', 'checking', 100000)
    returning id
  `;
  const accountId = a!.id;

  const [t] = await s<{ id: string }[]>`
    insert into transactions
      (account_id, kind, amount_cents, label, posted_at, source)
    values
      (${accountId}, 'deposit', 50000, 'seed', now(), 'manual')
    returning id
  `;
  const transactionId = t!.id;

  const [sd] = await s<{ id: string }[]>`
    insert into scheduled_deposits
      (account_id, label, amount_cents, frequency, anchor_date, next_run_at)
    values
      (${accountId}, 'Pension', 180000, 'monthly', '2026-05-01', '2026-06-01')
    returning id
  `;
  const scheduledDepositId = sd!.id;

  const code = `C-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  const [dc] = await s<{ id: string }[]>`
    insert into deposit_codes
      (patient_id, code, amount_cents, kind, label)
    values
      (${patientId}, ${code}, 5000, 'check', 'test')
    returning id
  `;
  const depositCodeId = dc!.id;

  const [al] = await s<{ id: string }[]>`
    insert into audit_log
      (caregiver_id, patient_id, action_kind, target_kind, target_id)
    values
      (${caregiverId}, ${patientId}, 'patient_created', 'patient', ${patientId})
    returning id
  `;
  const auditLogId = al!.id;

  return {
    userId,
    caregiverId,
    patientId,
    accountId,
    transactionId,
    scheduledDepositId,
    depositCodeId,
    auditLogId,
  };
}

// Open a transaction, switch to the authenticated role with the given
// user_id as auth.uid(), run fn, ROLLBACK. ROLLBACK means side effects of
// the test (UPDATEs that succeed on the caregiver's own row, etc.) don't
// leak between tests.
async function asCaregiver<T>(
  userId: string,
  fn: (tx: postgres.Sql) => Promise<T>,
): Promise<T> {
  if (!sql) throw new Error("sql not initialized");
  // postgres-js's .begin() ROLLBACKs on thrown error; for clean per-test
  // isolation we want ROLLBACK on success too. Use a manual BEGIN/ROLLBACK
  // and capture the result.
  const tx = await sql.reserve();
  try {
    await tx.unsafe("begin");
    await tx.unsafe("set local role authenticated");
    await tx.unsafe(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [userId],
    );
    const result = await fn(tx as unknown as postgres.Sql);
    await tx.unsafe("rollback");
    return result;
  } catch (err) {
    try {
      await tx.unsafe("rollback");
    } catch {
      // ignore — if rollback itself fails the original error is what matters
    }
    throw err;
  } finally {
    tx.release();
  }
}

beforeAll(async () => {
  if (!SHOULD_RUN) return;
  container = await new PostgreSqlContainer("postgres:15").start();
  sql = postgres(container.getConnectionUri(), {
    max: 5,
    prepare: false,
    // Silence the per-statement NOTICE chatter that supabase/policies.sql's
    // idempotent `drop policy if exists` block emits — they're benign and
    // make the test output unreadable.
    onnotice: () => {},
  });
  await setupDatabase(sql);
  A = await seedCaregiverChain(sql, "a@example.test");
  B = await seedCaregiverChain(sql, "b@example.test");
}, 120_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 30_000);

// Tables under test. `updateCol` is a text column safe to update to a
// fixed value for cross-tenant UPDATE assertions.
const TABLES: Array<{
  name: string;
  idKey: keyof Fixture;
  updateCol: string;
}> = [
  { name: "caregivers", idKey: "caregiverId", updateCol: "email" },
  { name: "patients", idKey: "patientId", updateCol: "display_name" },
  { name: "accounts", idKey: "accountId", updateCol: "name" },
  { name: "transactions", idKey: "transactionId", updateCol: "label" },
  {
    name: "scheduled_deposits",
    idKey: "scheduledDepositId",
    updateCol: "label",
  },
  { name: "deposit_codes", idKey: "depositCodeId", updateCol: "label" },
  { name: "audit_log", idKey: "auditLogId", updateCol: "note" },
];

describe.skipIf(!SHOULD_RUN)("RLS cross-tenant (real Postgres)", () => {
  describe("self-read positive controls", () => {
    for (const { name, idKey } of TABLES) {
      it(`caregiver A can SELECT their own ${name} row`, async () => {
        const rows = await asCaregiver(A.userId, (tx) =>
          tx.unsafe(`select id from ${name} where id = $1`, [A[idKey]]),
        );
        expect(rows.length).toBe(1);
      });
    }
  });

  describe("cross-tenant SELECT returns no rows", () => {
    for (const { name, idKey } of TABLES) {
      it(`caregiver A cannot SELECT B's ${name} row`, async () => {
        const rows = await asCaregiver(A.userId, (tx) =>
          tx.unsafe(`select id from ${name} where id = $1`, [B[idKey]]),
        );
        expect(rows.length).toBe(0);
      });

      it(`caregiver B cannot SELECT A's ${name} row`, async () => {
        const rows = await asCaregiver(B.userId, (tx) =>
          tx.unsafe(`select id from ${name} where id = $1`, [A[idKey]]),
        );
        expect(rows.length).toBe(0);
      });
    }
  });

  describe("cross-tenant UPDATE affects 0 rows", () => {
    for (const { name, idKey, updateCol } of TABLES) {
      it(`caregiver A cannot UPDATE B's ${name} row`, async () => {
        const result = await asCaregiver(A.userId, (tx) =>
          tx.unsafe(
            `update ${name} set ${updateCol} = 'tampered' where id = $1`,
            [B[idKey]],
          ),
        );
        expect(result.count).toBe(0);
      });
    }
  });

  describe("cross-tenant DELETE affects 0 rows", () => {
    for (const { name, idKey } of TABLES) {
      it(`caregiver A cannot DELETE B's ${name} row`, async () => {
        const result = await asCaregiver(A.userId, (tx) =>
          tx.unsafe(`delete from ${name} where id = $1`, [B[idKey]]),
        );
        expect(result.count).toBe(0);
      });
    }
  });

  // INSERT cases — each tests WITH CHECK against caregiver-A's identity.
  // Postgres reports RLS violations as 42501 (insufficient_privilege) with
  // a message containing "row-level security policy". We assert on the
  // thrown error rather than a row count, because RLS rejects the insert
  // before any row is written.
  describe("cross-tenant INSERT violates WITH CHECK", () => {
    async function expectRlsViolation(
      userId: string,
      fn: (tx: postgres.Sql) => Promise<unknown>,
    ): Promise<void> {
      await expect(asCaregiver(userId, fn)).rejects.toThrow(
        /row-level security/i,
      );
    }

    it("A cannot INSERT a patient tied to B's caregiver_id", async () => {
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into patients (caregiver_id, display_name) values ($1, 'evil')`,
          [B.caregiverId],
        ),
      );
    });

    it("A cannot INSERT an account tied to B's patient_id", async () => {
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into accounts (patient_id, name, type, balance_cents) values ($1, 'evil', 'checking', 0)`,
          [B.patientId],
        ),
      );
    });

    it("A cannot INSERT a transaction tied to B's account_id", async () => {
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into transactions (account_id, kind, amount_cents, label, posted_at, source)
           values ($1, 'deposit', 1, 'evil', now(), 'manual')`,
          [B.accountId],
        ),
      );
    });

    it("A cannot INSERT a scheduled_deposit tied to B's account_id", async () => {
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into scheduled_deposits (account_id, label, amount_cents, frequency, anchor_date, next_run_at)
           values ($1, 'evil', 1, 'monthly', '2026-05-01', '2026-06-01')`,
          [B.accountId],
        ),
      );
    });

    it("A cannot INSERT a deposit_code tied to B's patient_id", async () => {
      const code = `X-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into deposit_codes (patient_id, code, amount_cents, kind, label)
           values ($1, $2, 1, 'check', 'evil')`,
          [B.patientId, code],
        ),
      );
    });

    it("A cannot INSERT an audit_log tied to B's caregiver_id", async () => {
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into audit_log (caregiver_id, action_kind, target_kind, target_id)
           values ($1, 'patient_created', 'patient', $2)`,
          [B.caregiverId, B.patientId],
        ),
      );
    });

    it("A cannot INSERT a caregivers row claiming a different user_id", async () => {
      const otherUserId = crypto.randomUUID();
      await expectRlsViolation(A.userId, (tx) =>
        tx.unsafe(
          `insert into caregivers (user_id, email) values ($1, 'evil@example.test')`,
          [otherUserId],
        ),
      );
    });
  });
});
