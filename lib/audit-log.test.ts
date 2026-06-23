import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { logCaregiverAction } from "@/lib/audit-log";
import {
  auditActionKindEnum,
  auditLog,
  caregivers,
  patients,
} from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

async function seedCaregiverAndPatient(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "test@example.com" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ caregiverId: caregiver!.id, displayName: "Mom" })
    .returning();
  return { caregiverId: caregiver!.id, patientId: patient!.id };
}

describe("logCaregiverAction", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("inserts exactly one row with the expected fields", async () => {
    const { caregiverId, patientId } = await seedCaregiverAndPatient(db);

    await logCaregiverAction(db, {
      caregiverId,
      patientId,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: patientId,
      after: { displayName: "Mom" },
      note: "first patient",
    });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.caregiverId).toBe(caregiverId);
    expect(row.patientId).toBe(patientId);
    expect(row.actionKind).toBe("patient_created");
    expect(row.targetKind).toBe("patient");
    expect(row.targetId).toBe(patientId);
    expect(row.before).toBeNull();
    expect(row.after).toEqual({ displayName: "Mom" });
    expect(row.note).toBe("first patient");
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("writes null for omitted before/after/note", async () => {
    const { caregiverId, patientId } = await seedCaregiverAndPatient(db);

    await logCaregiverAction(db, {
      caregiverId,
      patientId,
      actionKind: "scheduled_deposit_deleted",
      targetKind: "scheduled_deposit",
      targetId: crypto.randomUUID(),
    });

    const [row] = await db.select().from(auditLog);
    expect(row!.before).toBeNull();
    expect(row!.after).toBeNull();
    expect(row!.note).toBeNull();
  });

  it("sanitizes Date instances in payloads to JSON-safe values", async () => {
    const { caregiverId, patientId } = await seedCaregiverAndPatient(db);
    const postedAt = new Date("2026-05-11T12:00:00.000Z");

    await logCaregiverAction(db, {
      caregiverId,
      patientId,
      actionKind: "transaction_created",
      targetKind: "transaction",
      targetId: crypto.randomUUID(),
      after: { postedAt, label: "ATM" },
    });

    const [row] = await db.select().from(auditLog);
    // After JSON-roundtrip the Date is a string; the helper's sanitize step
    // is what makes this round-trip safe.
    expect(row!.after).toEqual({
      postedAt: "2026-05-11T12:00:00.000Z",
      label: "ATM",
    });
  });

  it("accepts a null patientId for caregiver-level actions", async () => {
    const { caregiverId } = await seedCaregiverAndPatient(db);

    await logCaregiverAction(db, {
      caregiverId,
      patientId: null,
      actionKind: "patient_settings_updated",
      targetKind: "patient",
      targetId: null,
      after: { setting: "value" },
    });

    const [row] = await db.select().from(auditLog);
    expect(row!.patientId).toBeNull();
    expect(row!.targetId).toBeNull();
  });

  it("scopes by caregiver — querying one caregiver's log does not leak another's", async () => {
    const a = await seedCaregiverAndPatient(db);
    const b = await seedCaregiverAndPatient(db);

    await logCaregiverAction(db, {
      caregiverId: a.caregiverId,
      patientId: a.patientId,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: a.patientId,
      after: { who: "A" },
    });
    await logCaregiverAction(db, {
      caregiverId: b.caregiverId,
      patientId: b.patientId,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: b.patientId,
      after: { who: "B" },
    });

    const aRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.caregiverId, a.caregiverId));
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.after).toEqual({ who: "A" });
  });

  it("preserves nested object payloads through JSON roundtrip", async () => {
    const { caregiverId, patientId } = await seedCaregiverAndPatient(db);
    const fromAccountId = crypto.randomUUID();
    const toAccountId = crypto.randomUUID();
    const transferId = crypto.randomUUID();
    const txIds = [crypto.randomUUID(), crypto.randomUUID()];

    await logCaregiverAction(db, {
      caregiverId,
      patientId,
      actionKind: "transfer_made",
      targetKind: "account",
      targetId: fromAccountId,
      after: {
        transferId,
        fromAccountId,
        toAccountId,
        amountCents: 50_000,
        transactionIds: txIds,
      },
    });

    const [row] = await db.select().from(auditLog);
    expect(row!.after).toEqual({
      transferId,
      fromAccountId,
      toAccountId,
      amountCents: 50_000,
      transactionIds: txIds,
    });
  });
});

// Static coverage. Every non-reserved action_kind must appear in at least
// one source file that participates in the audit-log retrofit (any .ts file
// that imports logCaregiverAction). Match either inline-form
// `actionKind: "<kind>"` OR a bare string literal `"<kind>"` (the bare
// form catches computed patterns like toggleScheduledDepositAction's
// conditional). Catches a future enum addition that someone forgets to
// wire in.
//
// RESERVED enum values are documented-as-not-yet-implemented:
//   - code_voided: reserved by M4 spec; the void flow is a future milestone.
//     The other three previously-reserved kinds (patient_settings_updated,
//     account_renamed, scheduled_deposit_deleted) gained mutations in M4
//     Step 8 and now emit, so they no longer appear here.
describe("audit log enum coverage", () => {
  const RESERVED: ReadonlySet<string> = new Set(["code_voided"]);
  const SCAN_ROOTS = [
    resolve(process.cwd(), "app", "(caregiver)"),
    resolve(process.cwd(), "lib"),
  ];

  function walkTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      // Skip node_modules and tests — tests reference enum values for
      // assertion purposes, not for emission.
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(...walkTsFiles(full));
      } else if (
        entry.endsWith(".ts") &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".d.ts")
      ) {
        out.push(full);
      }
    }
    return out;
  }

  const candidateFiles = SCAN_ROOTS.flatMap(walkTsFiles);
  const auditedFiles = candidateFiles.filter((f) =>
    readFileSync(f, "utf8").includes("logCaregiverAction"),
  );
  const allSource = auditedFiles
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  for (const kind of auditActionKindEnum.enumValues) {
    if (RESERVED.has(kind)) continue;
    it(`emits action_kind="${kind}" from at least one caregiver action file`, () => {
      const inlineForm = new RegExp(`actionKind:\\s*["']${kind}["']`);
      const bareLiteral = new RegExp(`["']${kind}["']`);
      const found = inlineForm.test(allSource) || bareLiteral.test(allSource);
      expect(
        found,
        `No call site found for action_kind="${kind}" across audited ` +
          `files (${auditedFiles.length} scanned). Search for the literal ` +
          `"${kind}". If this kind is intentionally not yet emitted, add ` +
          `it to RESERVED with a comment explaining why.`,
      ).toBe(true);
    });
  }

  for (const kind of RESERVED) {
    it(`reserved enum value "${kind}" is intentionally not emitted yet`, () => {
      const pattern = new RegExp(`["']${kind}["']`);
      expect(
        pattern.test(allSource),
        `Found a reference to reserved kind "${kind}" in audited files. ` +
          `If a mutation now emits this, remove it from RESERVED.`,
      ).toBe(false);
    });
  }
});
