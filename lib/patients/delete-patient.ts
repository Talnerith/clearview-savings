import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import { patients, type Patient } from "@/lib/db/schema";

// Shared core of "delete a patient", extracted from the web Server Action so the
// mobile API endpoint deletes a patient identically. Callers must first assert
// the caregiver owns `patientId` (the web action via getPatientForCaregiver, the
// mobile route via requireApiPatient); we re-scope the lookup by caregiverId
// anyway as defence in depth.
//
// Deleting the patient cascades to its accounts, transactions, scheduled
// deposits, and deposit codes (FKs are ON DELETE CASCADE in the schema). The
// patient's audit_log rows have patient_id set null on delete, so the history
// is retained without a dangling reference — including the patient_deleted row
// written here, which keeps the action in the caregiver's log for accountability.

export const deletePatientInput = z.object({
  patientId: z.string().uuid(),
});

export type DeletePatientInput = z.infer<typeof deletePatientInput>;

export async function deletePatient(
  db: AppDatabase,
  args: { caregiverId: string } & DeletePatientInput,
): Promise<Patient> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.id, args.patientId),
          eq(patients.caregiverId, args.caregiverId),
        ),
      )
      .limit(1);
    if (!before) {
      throw new Error("Patient not found");
    }

    // Audit before the delete so the snapshot is captured; the cascade then sets
    // this row's patient_id null along with the patient's other history.
    await logCaregiverAction(tx, {
      caregiverId: args.caregiverId,
      patientId: args.patientId,
      actionKind: "patient_deleted",
      targetKind: "patient",
      targetId: before.id,
      before,
    });

    await tx.delete(patients).where(eq(patients.id, args.patientId));

    return before;
  });
}
