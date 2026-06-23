"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logCaregiverAction } from "@/lib/audit-log";
import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { accounts, patients } from "@/lib/db/schema";

const addPatientSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Patient name is required.")
    .max(80, "Patient name is too long."),
});

export async function addPatientAction(formData: FormData): Promise<void> {
  const caregiver = await getCurrentCaregiver();

  const parsed = addPatientSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/caregiver?error=${encodeURIComponent(message)}`);
  }

  await db.transaction(async (tx) => {
    const [patient] = await tx
      .insert(patients)
      .values({
        caregiverId: caregiver.id,
        displayName: parsed.data.displayName,
      })
      .returning();
    if (!patient) {
      throw new Error("Failed to create patient");
    }

    const [account] = await tx
      .insert(accounts)
      .values({
        patientId: patient.id,
        name: "Checking",
        type: "checking",
      })
      .returning();
    if (!account) {
      throw new Error("Failed to create patient's checking account");
    }

    await logCaregiverAction(tx, {
      caregiverId: caregiver.id,
      patientId: patient.id,
      actionKind: "patient_created",
      targetKind: "patient",
      targetId: patient.id,
      after: patient,
    });
    await logCaregiverAction(tx, {
      caregiverId: caregiver.id,
      patientId: patient.id,
      actionKind: "account_created",
      targetKind: "account",
      targetId: account.id,
      after: account,
      note: "Auto-created on patient creation",
    });
  });

  revalidatePath("/caregiver");
  redirect("/caregiver?status=added");
}
