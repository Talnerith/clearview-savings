import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in .env.local");
  }

  const sqlPath = resolve(process.cwd(), "supabase", "policies.sql");
  const sqlText = readFileSync(sqlPath, "utf8");

  const client = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    console.log(`Applying policies from ${sqlPath} ...`);
    await client.unsafe(sqlText);
    console.log("RLS policies applied.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
