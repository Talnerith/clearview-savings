import { beforeEach, describe, expect, it } from "vitest";

import { accounts, auditLog, caregivers, patients, scheduledDeposits } from "@/lib/db/schema";
import { createInMemoryDb, type TestDb } from "@/lib/test/pg-mem";

import {
  addScheduledDeposit,
  deleteScheduledDeposit,
  toggleScheduledDeposit,
} from "./manage";

async function seedPatient(db: TestDb) {
  const [caregiver] = await db
    .insert(caregivers)
    .values({ userId: crypto.randomUUID(), email: "cg@example.com" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ caregiverId: caregiver!.id, displayName: "Mom" })
    .returning();
  const [checking] = await db
    .insert(accounts)
    .values({ patientId: patient!.id, name: "Checking", type: "checking" })
    .returning();
  return { caregiverId: caregiver!.id, patientId: patient!.id, checkingId: checking!.id };
}

describe("scheduled deposits", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  async function addOne(s: Awaited<ReturnType<typeof seedPatient>>) {
    return addScheduledDeposit(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      accountId: s.checkingId,
      label: "Pension",
      amount: "2000.00",
      frequency: "monthly",
      anchorDate: "2026-07-01",
      pendingDays: 5,
    });
  }

  it("adds a deposit with the right amount + audit row", async () => {
    const s = await seedPatient(db);
    const sd = await addOne(s);
    expect(sd.amountCents).toBe(200_000);
    expect(sd.label).toBe("Pension");
    expect(sd.active).toBe(true);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("rejects an account that doesn't belong to the patient", async () => {
    const a = await seedPatient(db);
    const b = await seedPatient(db);
    await expect(
      addScheduledDeposit(db, {
        caregiverId: a.caregiverId,
        patientId: a.patientId,
        accountId: b.checkingId,
        label: "X",
        amount: "1.00",
        frequency: "weekly",
        anchorDate: "2026-07-01",
        pendingDays: 5,
      }),
    ).rejects.toThrow("Account does not belong to this patient.");
  });

  it("pause logs scheduled_deposit_paused; resume logs scheduled_deposit_updated", async () => {
    const s = await seedPatient(db);
    const sd = await addOne(s);

    const paused = await toggleScheduledDeposit(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      depositId: sd.id,
      active: false,
    });
    expect(paused.active).toBe(false);

    const resumed = await toggleScheduledDeposit(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      depositId: sd.id,
      active: true,
    });
    expect(resumed.active).toBe(true);

    const kinds = (await db.select().from(auditLog)).map((a) => a.actionKind);
    expect(kinds).toContain("scheduled_deposit_paused");
    expect(kinds).toContain("scheduled_deposit_updated");
  });

  it("deletes a deposit and audits it", async () => {
    const s = await seedPatient(db);
    const sd = await addOne(s);
    await deleteScheduledDeposit(db, {
      caregiverId: s.caregiverId,
      patientId: s.patientId,
      depositId: sd.id,
    });
    expect(await db.select().from(scheduledDeposits)).toHaveLength(0);
    const kinds = (await db.select().from(auditLog)).map((a) => a.actionKind);
    expect(kinds).toContain("scheduled_deposit_deleted");
  });
});
