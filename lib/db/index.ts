import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// `prepare: false` keeps this safe with Supabase's transaction-mode pooler if
// DATABASE_URL ever points at port 6543. For Milestone 1 we use the session
// pooler (port 5432); the flag is harmless either way.
//
// Cache the client on globalThis so Next.js HMR doesn't spawn a fresh pool on
// every module re-evaluation. Without this, dev sessions accumulate pools
// against Supabase's session-mode pooler (small pool_size) and eventually
// throw MaxClientsInSessionMode. Production has no HMR, so the global is a
// dev-only safety belt — but the cache itself is harmless in prod.
type ClientGlobal = {
  __clearviewPg?: ReturnType<typeof postgres>;
};
const g = globalThis as unknown as ClientGlobal;

const client =
  g.__clearviewPg ??
  postgres(databaseUrl, {
    prepare: false,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  g.__clearviewPg = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
export { schema };
