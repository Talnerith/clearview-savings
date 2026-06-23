import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { accounts, caregivers, depositCodes, patients } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

// Integration coverage for M8 Part B (ADR 0004): the workbook reward is now a
// kind = "check" deposit code distinguished from a plain check only by
// carrying workbook content (workbook_kind). These tests run the real SQL —
// the migration body and the production surface filters — against pg-mem.

async function seedPatient(db: TestDb): Promise<string> {
  const [c] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: `c-${crypto.randomUUID()}@x.test` })
    .returning();
  const [p] = await db
    .insert(patients)
    .values({ caregiverId: c!.id, displayName: "Pat" })
    .returning();
  await db
    .insert(accounts)
    .values({ patientId: p!.id, name: "Checking", type: "checking", balanceCents: 0 })
    .returning();
  return p!.id;
}

let db: TestDb;
beforeEach(async () => {
  db = await createInMemoryDb();
});

describe("migration 0005 — unused workbook codes become checks", () => {
  // Re-run the committed migration body (idempotent) after seeding the
  // pre-M8 rows it is meant to convert.
  function migration0005Sql(): string {
    const dir = resolve(process.cwd(), "drizzle");
    const file = readdirSync(dir).find((f) => /^0005_.*\.sql$/.test(f));
    if (!file) throw new Error("0005 migration file not found");
    return readFileSync(resolve(dir, file), "utf8");
  }

  it("flips unused workbook rows to check and leaves used ones alone", async () => {
    const patientId = await seedPatient(db);
    const [unused] = await db
      .insert(depositCodes)
      .values({
        patientId,
        code: "UNUSEDWB",
        amountCents: 500,
        kind: "workbook",
        label: "old reward",
        workbookKind: "mixed",
      })
      .returning();
    const [used] = await db
      .insert(depositCodes)
      .values({
        patientId,
        code: "USEDWB00",
        amountCents: 500,
        kind: "workbook",
        label: "old used reward",
        workbookKind: "mixed",
        status: "used",
        usedAt: new Date("2026-06-01T00:00:00Z"),
      })
      .returning();

    await db.execute(sql.raw(migration0005Sql()));

    const after = async (id: string) =>
      (await db.select().from(depositCodes).where(eq(depositCodes.id, id)).limit(1))[0];

    // Unused workbook reward is now redeemable as a check…
    expect((await after(unused!.id))?.kind).toBe("check");
    // …but the historical used row keeps its kind for the record.
    expect((await after(used!.id))?.kind).toBe("workbook");
  });
});

describe("workbook reward vs plain check surface separation", () => {
  const WORKBOOKS = isNotNull(depositCodes.workbookKind);
  const CHECKS = and(eq(depositCodes.kind, "check"), isNull(depositCodes.workbookKind));

  beforeEach(async () => {
    const patientId = await seedPatient(db);
    // A workbook reward minted the M8 way: kind = "check" + workbook content.
    await db.insert(depositCodes).values({
      patientId,
      code: "WBREWARD",
      amountCents: 500,
      kind: "check",
      label: "Activity Set #1",
      workbookKind: "mixed",
    });
    // A plain check: kind = "check", no workbook content.
    await db.insert(depositCodes).values({
      patientId,
      code: "PLAINCHK",
      amountCents: 2000,
      kind: "check",
      label: "Birthday check",
    });
  });

  it("shows the workbook reward on the Workbooks surface, not Checks", async () => {
    const wb = await db.select().from(depositCodes).where(WORKBOOKS);
    expect(wb.map((r) => r.code)).toEqual(["WBREWARD"]);
  });

  it("shows the plain check on the Checks surface, not Workbooks", async () => {
    const checks = await db.select().from(depositCodes).where(CHECKS);
    expect(checks.map((r) => r.code)).toEqual(["PLAINCHK"]);
  });
});
