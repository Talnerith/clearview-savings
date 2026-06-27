"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";
import { performTransfer, transferInput } from "@/lib/transfers/transfer";

function bouncePatient(patientId: string, error: string): never {
  redirect(
    `/caregiver/patients/${patientId}?error=${encodeURIComponent(error)}`,
  );
}

export async function transferAction(formData: FormData): Promise<void> {
  const parsed = transferInput.safeParse({
    patientId: formData.get("patientId"),
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );
  const cents = dollarsToCents(parsed.data.amount);

  try {
    await performTransfer(db, {
      caregiverId: caregiver.id,
      patientId: patient.id,
      fromAccountId: parsed.data.fromAccountId,
      toAccountId: parsed.data.toAccountId,
      amountCents: cents,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Transfer failed.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=transfer_completed`);
}
