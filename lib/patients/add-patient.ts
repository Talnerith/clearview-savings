import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import { accounts, patients, type Patient } from "@/lib/db/schema";

// Shared core of "add a patient", extracted from the web Server Action so the
// mobile API endpoint creates a patient identically (patient + auto "Checking"
// account + two audit rows, in one transaction).

export const addPatientInput = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Patient name is required.")
    .max(80, "Patient name is too long."),
});

export type AddPatientInput = z.infer<typeof addPatientInput>;

export async function addPatient(
  db: AppDatabase,
  args: { caregiverId: string } & AddPatientInput,
): Promise<Patient> {
  return db.transaction(async (tx) => {
    const [patient] = await tx
      .insert(patients)
      .values({ caregiverId: args.caregiverId, displayName: args.displayName })
      .returning();
    if (!patient) {
      throw new Error("Failed to create patient");
    }

    const [account] = await tx
      .insert(accounts)
      .values({ patientId: patient.id, name: "Checking", type: "checking" })
      .returning();
    if (!account) {
      throw new Error("Failed to create patient's checking account");
    }

    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: patient.id,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: patient.id,
      after: patient,
    });
    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: patient.id,
      actionKind: "account_created",
      targetKind: "account",
      targetId: account.id,
      after: account,
      note: "Auto-created on patient creation",
    });

    return patient;
  });
}
