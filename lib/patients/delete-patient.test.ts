import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { accounts, auditLog, caregivers, patients } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import { addPatient } from "./add-patient";
import { deletePatient } from "./delete-patient";

async function seedCaregiver(db: TestDb, email = "cg@example.com") {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email })
    .returning();
  return caregiver!.id;
}

describe("deletePatient", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  it("deletes the patient, cascades its accounts, and logs the action", async () => {
    const caregiverId = await seedCaregiver(db);
    const patient = await addPatient(db, { caregiverId, displayName: "Mom" });

    const deleted = await deletePatient(db, {
      caregiverId,
      patientId: patient.id,
    });
    expect(deleted.id).toBe(patient.id);

    // Patient row and its auto Checking account are gone.
    const remainingPatients = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patient.id));
    expect(remainingPatients).toHaveLength(0);

    const remainingAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.patientId, patient.id));
    expect(remainingAccounts).toHaveLength(0);

    // The deletion is in the caregiver's audit log; the cascade set patient_id
    // null on every retained row, so we match on the action kind + caregiver.
    const audit = await db.select().from(auditLog);
    const deletedRows = audit.filter((a) => a.actionKind === "patient_deleted");
    expect(deletedRows).toHaveLength(1);
    expect(deletedRows[0]!.caregiverId).toBe(caregiverId);
    expect(deletedRows[0]!.targetId).toBe(patient.id);
    expect(audit.every((a) => a.patientId === null)).toBe(true);
  });

  it("refuses to delete a patient owned by another caregiver", async () => {
    const owner = await seedCaregiver(db, "owner@example.com");
    const other = await seedCaregiver(db, "other@example.com");
    const patient = await addPatient(db, {
      caregiverId: owner,
      displayName: "Mom",
    });

    await expect(
      deletePatient(db, { caregiverId: other, patientId: patient.id }),
    ).rejects.toThrow(/not found/i);

    // The patient is untouched.
    const stillThere = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patient.id));
    expect(stillThere).toHaveLength(1);
  });
});
