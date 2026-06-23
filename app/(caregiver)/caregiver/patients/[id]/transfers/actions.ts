"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { performTransfer } from "@/lib/transfers/transfer";

const uuid = z.string().uuid();
const dollarsString = z
  .string()
  .trim()
  .min(1, "Amount is required.")
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount like 1234.56.");

function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

function bouncePatient(patientId: string, error: string): never {
  redirect(
    `/caregiver/patients/${patientId}?error=${encodeURIComponent(error)}`,
  );
}

const transferSchema = z
  .object({
    patientId: uuid,
    fromAccountId: uuid,
    toAccountId: uuid,
    amount: dollarsString,
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Choose two different accounts.",
    path: ["toAccountId"],
  });

export async function transferAction(formData: FormData): Promise<void> {
  const parsed = transferSchema.safeParse({
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
