import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { DataType, newDb } from "pg-mem";

import * as schema from "@/lib/db/schema";

export type TestDb = NodePgDatabase<typeof schema>;

// pg-mem's parser rejects `ON CONFLICT (cols) WHERE pred DO NOTHING`,
// which Drizzle emits to match a partial unique index. pg-mem treats
// unique indexes as non-partial, so dropping the predicate keeps the
// same idempotency semantics for our schema.
const ON_CONFLICT_REWRITE =
  / on conflict \(([^)]+)\) where .+? do nothing/i;

export async function createInMemoryDb(): Promise<TestDb> {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  // pg-mem ships without pgcrypto; the schema relies on gen_random_uuid()
  // for primary-key defaults, so register a JS-backed equivalent.
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  const drizzleDir = resolve(process.cwd(), "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(resolve(drizzleDir, file), "utf8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      mem.public.none(statement);
    }
  }

  // pg-mem's `mem.adapters.createPg()` returns Pool/Client emulators that
  // match the `pg` package's API surface. drizzle's node-postgres adapter
  // talks through that surface AND properly supports db.transaction() —
  // which the pg-proxy adapter does not (see docs/gotchas.md).
  //
  // We pass a Client (not a Pool) because drizzle does
  // `this.client instanceof Pool` (against pg's actual Pool class) to
  // decide whether to acquire a dedicated connection for a transaction.
  // pg-mem's Pool emulator doesn't extend pg's Pool, so the check fails
  // and drizzle would skip connection acquisition — which means BEGIN /
  // COMMIT would have no isolation effect (each query auto-commits via
  // the pool's per-query session). Using a Client sidesteps that: drizzle
  // treats it as the single session and runs every transaction query
  // (including BEGIN/COMMIT/ROLLBACK) through it. Single-client
  // serialization is fine for in-memory tests.
  const { Client } = mem.adapters.createPg();
  const rawClient = new Client();
  await rawClient.connect();
  const wrappedClient = wrapClient(rawClient);

  return drizzle(wrappedClient, { schema });
}

// Adapter shim. pg-mem rejects two things drizzle's node-postgres adapter
// always sets: a per-query `types` object (custom type parsers), and
// `rowMode: 'array'` (positional rows for drizzle's mapResultRow).
//
// We strip both before forwarding, then convert each result row from
// pg-mem's `{ col: value }` shape to a positional `[value, ...]` array
// when array form was requested. pg-mem returns object keys in column
// order, so `Object.values(row)` preserves position the same way the
// production driver's array-form rows would.
//
// We also coerce date columns (pg-mem returns Date-at-midnight-UTC for
// `date`; production postgres-js returns YYYY-MM-DD strings) so the
// application code reads the same shape under test as in prod.
function wrapClient<T extends object>(client: T): T {
  type AnyFn = (...args: unknown[]) => unknown;
  const c = client as unknown as { query: AnyFn };

  const originalQuery = c.query.bind(client);
  c.query = (async (config: unknown, values?: unknown, callback?: unknown) => {
    const { config: rewritten, wantsArrayRows } = adaptQuery(config);
    const result = (await (originalQuery as AnyFn)(
      rewritten,
      values,
      callback,
    )) as { rows?: unknown[] } | undefined;
    if (result && Array.isArray(result.rows)) {
      result.rows = result.rows.map((row) => {
        if (!row || typeof row !== "object") return row;
        const coerced = coerceDateColumns(row);
        return wantsArrayRows ? Object.values(coerced) : coerced;
      });
    }
    return result;
  }) as AnyFn;

  return client;
}

function adaptQuery(
  config: unknown,
): { config: unknown; wantsArrayRows: boolean } {
  if (typeof config === "string") {
    return {
      config: config.replace(
        ON_CONFLICT_REWRITE,
        " on conflict ($1) do nothing",
      ),
      wantsArrayRows: false,
    };
  }
  if (
    config &&
    typeof config === "object" &&
    "text" in config &&
    typeof (config as { text: unknown }).text === "string"
  ) {
    const cfg = config as {
      text: string;
      types?: unknown;
      rowMode?: unknown;
      [k: string]: unknown;
    };
    const { types: _types, rowMode, ...rest } = cfg;
    void _types;
    return {
      config: {
        ...rest,
        text: rest.text.replace(
          ON_CONFLICT_REWRITE,
          " on conflict ($1) do nothing",
        ),
      },
      wantsArrayRows: rowMode === "array",
    };
  }
  return { config, wantsArrayRows: false };
}

function coerceDateColumns(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (
      value instanceof Date &&
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    ) {
      out[key] = value.toISOString().slice(0, 10);
    }
  }
  return out;
}
