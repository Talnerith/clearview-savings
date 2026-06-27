"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { addPatient, addPatientInput } from "@/lib/patients/add-patient";

export async function addPatientAction(formData: FormData): Promise<void> {
  const caregiver = await getCurrentCaregiver();

  const parsed = addPatientInput.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/caregiver?error=${encodeURIComponent(message)}`);
  }

  await addPatient(db, {
    caregiverId: caregiver.id,
    displayName: parsed.data.displayName,
  });

  revalidatePath("/caregiver");
  redirect("/caregiver?status=added");
}
