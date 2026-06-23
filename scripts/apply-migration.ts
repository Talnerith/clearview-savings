import { config as loadEnv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

// Historical name from when the project was "B4A". Kept as-is because
// the table physically exists in production under this name; renaming
// would require a dedicated ALTER TABLE migration for zero functional
// benefit. This is the migration-tracking table — equivalent to
// drizzle's own journal.
const TRACKING_TABLE = "_b4a_applied_migrations";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const drizzleDir = resolve(process.cwd(), "drizzle");
  const migrations = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (migrations.length === 0) {
    throw new Error("No migration files found in drizzle/");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql.unsafe(`
      create table if not exists ${TRACKING_TABLE} (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const appliedRows = await sql<
      { filename: string }[]
    >`select filename from ${sql(TRACKING_TABLE)}`;
    const applied = new Set(appliedRows.map((r) => r.filename));

    let count = 0;
    for (const filename of migrations) {
      if (applied.has(filename)) {
        console.log(`Skipping ${filename} (already applied).`);
        continue;
      }
      const path = resolve(drizzleDir, filename);
      const text = readFileSync(path, "utf8");
      console.log(`Applying ${filename} ...`);
      // drizzle splits statements with the marker `--> statement-breakpoint`.
      // postgres.js .unsafe accepts a multi-statement string and runs them.
      await sql.unsafe(text);
      await sql`insert into ${sql(TRACKING_TABLE)} (filename) values (${filename})`;
      count += 1;
    }

    if (count === 0) {
      console.log("No new migrations to apply.");
    } else {
      console.log(`Applied ${count} migration${count === 1 ? "" : "s"}.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e: unknown) => {
  console.error("FAIL:", e);
  process.exit(1);
});
