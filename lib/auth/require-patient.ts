import "server-only";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { patients, type Caregiver, type Patient } from "@/lib/db/schema";

// Resolves a patient id to a row, asserting that the current caregiver owns it.
// If the caregiver does not own the patient (or it does not exist), redirects
// back to /caregiver. RLS will also block the underlying queries, but this
// guard gives us a clean redirect rather than an empty page.
export async function getPatientForCaregiver(
  patientId: string,
): Promise<{ patient: Patient; caregiver: Caregiver }> {
  const caregiver = await getCurrentCaregiver();

  const rows = await db
    .select()
    .from(patients)
    .where(
      and(eq(patients.id, patientId), eq(patients.caregiverId, caregiver.id)),
    )
    .limit(1);

  const patient = rows[0];
  if (!patient) {
    redirect("/caregiver");
  }

  return { patient, caregiver };
}
