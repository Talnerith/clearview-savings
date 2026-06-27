import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { patients, type Patient } from "@/lib/db/schema";

// Returns the patient row iff `caregiverId` owns it, else null. The non-throwing
// twin of getPatientForCaregiver (which redirects on miss — wrong for a JSON
// API). Ownership is enforced here, server-side; a crafted patientId from a
// client simply returns null, never another caregiver's patient.
export async function findOwnedPatient(
  caregiverId: string,
  patientId: string,
): Promise<Patient | null> {
  const rows = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.caregiverId, caregiverId)))
    .limit(1);
  return rows[0] ?? null;
}
