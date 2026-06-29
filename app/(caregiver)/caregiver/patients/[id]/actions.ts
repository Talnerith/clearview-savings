"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addAccount,
  addAccountInput,
  renameAccount,
  renameAccountInput,
} from "@/lib/accounts/manage";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { deletePatient, deletePatientInput } from "@/lib/patients/delete-patient";
import { updatePatientSettings, updatePatientSettingsInput } from "@/lib/patients/update-settings";
import {
  addScheduledDeposit,
  addScheduledDepositInput,
  deleteScheduledDeposit,
  deleteScheduledDepositInput,
  toggleScheduledDeposit,
  toggleScheduledDepositInput,
} from "@/lib/scheduled-deposits/manage";
import {
  applyManualAdjustment,
  manualAdjustmentInput,
} from "@/lib/transactions/manual-adjustment";

// These Server Actions are thin form-facing wrappers: validate the FormData,
// assert caregiver ownership, then delegate to the shared helper that the mobile
// API endpoints (app/api/m/*) also call — one source of truth for every
// balance-/data-affecting write. On a thrown invariant they bounce back to the
// patient page with a calm error.

function bouncePatient(patientId: string, error: string): never {
  redirect(
    `/caregiver/patients/${patientId}?error=${encodeURIComponent(error)}`,
  );
}

export async function addAccountAction(formData: FormData): Promise<void> {
  const parsed = addAccountInput.safeParse({
    patientId: formData.get("patientId"),
    name: formData.get("name") ?? undefined,
    startingBalance: formData.get("startingBalance") ?? undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await addAccount(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not add the account.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=account_added`);
}

export async function manualAdjustmentAction(
  formData: FormData,
): Promise<void> {
  const parsed = manualAdjustmentInput.safeParse({
    patientId: formData.get("patientId"),
    accountId: formData.get("accountId"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    label: formData.get("label"),
    direction: formData.get("direction") || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await applyManualAdjustment(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not post the transaction.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=adjustment_added`);
}

export async function addScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = addScheduledDepositInput.safeParse({
    patientId: formData.get("patientId"),
    accountId: formData.get("accountId"),
    label: formData.get("label"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    anchorDate: formData.get("anchorDate"),
    pendingDays: formData.get("pendingDays"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await addScheduledDeposit(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not add the deposit.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_added`);
}

export async function toggleScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = toggleScheduledDepositInput.safeParse({
    patientId: formData.get("patientId"),
    depositId: formData.get("depositId"),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) {
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, "Invalid input.");
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await toggleScheduledDeposit(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not update the deposit.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_toggled`);
}

export async function deleteScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = deleteScheduledDepositInput.safeParse({
    patientId: formData.get("patientId"),
    depositId: formData.get("depositId"),
  });
  if (!parsed.success) {
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, "Invalid input.");
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await deleteScheduledDeposit(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not delete the deposit.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_deleted`);
}

export async function deletePatientAction(formData: FormData): Promise<void> {
  const parsed = deletePatientInput.safeParse({
    patientId: formData.get("patientId"),
  });
  if (!parsed.success) {
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, "Invalid input.");
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await deletePatient(db, {
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not delete the patient.",
    );
  }

  // The patient page no longer exists — bounce to the dashboard.
  revalidatePath("/caregiver");
  redirect("/caregiver?status=patient_deleted");
}

export async function updatePatientSettingsAction(
  formData: FormData,
): Promise<void> {
  const parsed = updatePatientSettingsInput.safeParse({
    patientId: formData.get("patientId"),
    displayName: formData.get("displayName"),
    fontSize: formData.get("fontSize"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await updatePatientSettings(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not save settings.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=settings_updated`);
}

export async function renameAccountAction(formData: FormData): Promise<void> {
  const parsed = renameAccountInput.safeParse({
    patientId: formData.get("patientId"),
    accountId: formData.get("accountId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, message);
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  try {
    await renameAccount(db, {
      ...parsed.data,
      patientId: patient.id,
      caregiverId: caregiver.id,
    });
  } catch (err) {
    bouncePatient(
      patient.id,
      err instanceof Error ? err.message : "Could not rename the account.",
    );
  }

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=account_renamed`);
}
