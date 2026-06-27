import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { accounts, auditLog, caregivers } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { addPatient } from "./add-patient";

async function seedCaregiver(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "cg@example.com" })
    .returning();
  return caregiver!.id;
}

describe("addPatient", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("creates the patient with an auto Checking account and two audit rows", async () => {
    const caregiverId = await seedCaregiver(db);
    const patient = await addPatient(db, { caregiverId, displayName: "Mom" });

    expect(patient.displayName).toBe("Mom");
    expect(patient.caregiverId).toBe(caregiverId);

    const accts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.patientId, patient.id));
    expect(accts).toHaveLength(1);
    expect(accts[0]!.name).toBe("Checking");
    expect(accts[0]!.type).toBe("checking");

    const audit = await db.select().from(auditLog);
    const kinds = audit.map((a) => a.actionKind).sort();
    expect(kinds).toEqual(["account_created", "patient_created"]);
    expect(audit.every((a) => a.caregiverId === caregiverId)).toBe(true);
    expect(audit.every((a) => a.patientId === patient.id)).toBe(true);
  });
});
