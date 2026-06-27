"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logCaregiverAction } from "@/lib/audit-log";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import {
  accounts,
  patients,
  scheduledDeposits,
  transactions,
} from "@/lib/db/schema";
import { currencyForLocale } from "@/lib/locale-currency";
import { dollarsString, dollarsToCents } from "@/lib/money";
import {
  applyManualAdjustment,
  manualAdjustmentInput,
} from "@/lib/transactions/manual-adjustment";

const uuid = z.string().uuid();

function bouncePatient(patientId: string, error: string): never {
  redirect(
    `/caregiver/patients/${patientId}?error=${encodeURIComponent(error)}`,
  );
}

// Savings account creation. Patients get a checking account auto-created on
// patient creation (see `app/(caregiver)/caregiver/actions.ts addPatientAction`);
// the only caregiver-initiated account is savings. Starting balance is
// optional — if > 0, an opening adjustment transaction is posted alongside
// the account so the Recent Transactions view reflects how the balance got
// there.
const addSavingsAccountSchema = z.object({
  patientId: uuid,
  name: z
    .string()
    .trim()
    .min(1, "Account name is required.")
    .max(40)
    .default("Savings"),
  // Optional. Empty string and "0" both mean "no opening transaction".
  startingBalance: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "0"))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
      message: "Enter a positive amount like 500.00.",
    }),
});

export async function addAccountAction(formData: FormData): Promise<void> {
  const parsed = addSavingsAccountSchema.safeParse({
    patientId: formData.get("patientId"),
    name: formData.get("name"),
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

  // Reject if a savings account already exists. The form is only rendered
  // when none exists, but a stale form submit or a curl request shouldn't
  // create a second one.
  const existingSavings = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.patientId, patient.id), eq(accounts.type, "savings")),
    )
    .limit(1);
  if (existingSavings[0]) {
    bouncePatient(patient.id, "A savings account already exists.");
  }

  const openingCents = dollarsToCents(parsed.data.startingBalance);

  const { account, openingTx } = await db.transaction(async (tx) => {
    const [createdAccount] = await tx
      .insert(accounts)
      .values({
        patientId: patient.id,
        name: parsed.data.name,
        type: "savings",
      })
      .returning();
    if (!createdAccount) {
      throw new Error("Failed to create account");
    }

    let createdOpeningTx: typeof transactions.$inferSelect | undefined;
    if (openingCents > 0) {
      const [openingRow] = await tx
        .insert(transactions)
        .values({
          accountId: createdAccount.id,
          kind: "adjustment",
          amountCents: openingCents,
          label: "Opening balance",
          postedAt: new Date(),
          source: "manual",
        })
        .returning();
      if (!openingRow) {
        throw new Error("Failed to post opening balance");
      }
      createdOpeningTx = openingRow;

      await tx
        .update(accounts)
        .set({ balanceCents: openingCents })
        .where(eq(accounts.id, createdAccount.id));
    }

    await logCaregiverAction(tx, {
      caregiverId: caregiver.id,
      patientId: patient.id,
      actionKind: "account_created",
      targetKind: "account",
      targetId: createdAccount.id,
      after: {
        account: createdAccount,
        openingTransactionId: createdOpeningTx?.id ?? null,
        openingAmountCents: openingCents,
      },
      note: openingCents > 0 ? "Opened with starting balance" : null,
    });

    return { account: createdAccount, openingTx: createdOpeningTx };
  });

  void account;
  void openingTx;

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

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

const addScheduledDepositSchema = z.object({
  patientId: uuid,
  accountId: uuid,
  label: z.string().trim().min(1, "Label is required.").max(60),
  amount: dollarsString,
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  anchorDate: isoDate,
  // 0..14 inclusive. Mirrors the DB CHECK constraint
  // `scheduled_deposits_pending_days_range`. Empty form value coerces to the
  // 5-day default so curl / pre-M4 form submits behave the same.
  pendingDays: z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? 5 : v),
      z.coerce.number().int().min(0).max(14),
    )
    .default(5),
});

export async function addScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = addScheduledDepositSchema.safeParse({
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

  // Verify the account belongs to the patient before insert.
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, parsed.data.accountId),
        eq(accounts.patientId, patient.id),
      ),
    )
    .limit(1);
  if (!owned[0]) {
    bouncePatient(patient.id, "Account does not belong to this patient.");
  }

  const [inserted] = await db
    .insert(scheduledDeposits)
    .values({
      accountId: parsed.data.accountId,
      label: parsed.data.label,
      amountCents: dollarsToCents(parsed.data.amount),
      frequency: parsed.data.frequency,
      anchorDate: parsed.data.anchorDate,
      nextRunAt: parsed.data.anchorDate,
      pendingDays: parsed.data.pendingDays,
    })
    .returning();
  if (!inserted) {
    throw new Error("Failed to create scheduled deposit");
  }

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind: "scheduled_deposit_created",
    targetKind: "scheduled_deposit",
    targetId: inserted.id,
    after: inserted,
  });

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_added`);
}

const toggleScheduledDepositSchema = z.object({
  patientId: uuid,
  depositId: uuid,
  active: z.enum(["true", "false"]),
});

export async function toggleScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = toggleScheduledDepositSchema.safeParse({
    patientId: formData.get("patientId"),
    depositId: formData.get("depositId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    const patientId = (formData.get("patientId") as string | null) ?? "";
    bouncePatient(patientId, "Invalid input.");
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  // Confirm the deposit's account belongs to this patient. Read the full row
  // for the audit-log `before` snapshot in the same pass.
  const rows = await db
    .select({ sd: scheduledDeposits })
    .from(scheduledDeposits)
    .innerJoin(accounts, eq(accounts.id, scheduledDeposits.accountId))
    .where(
      and(
        eq(scheduledDeposits.id, parsed.data.depositId),
        eq(accounts.patientId, patient.id),
      ),
    )
    .limit(1);
  const before = rows[0]?.sd;
  if (!before) {
    bouncePatient(patient.id, "Scheduled deposit not found.");
  }

  const newActive = parsed.data.active === "true";
  const [updated] = await db
    .update(scheduledDeposits)
    .set({ active: newActive })
    .where(eq(scheduledDeposits.id, parsed.data.depositId))
    .returning();
  if (!updated) {
    throw new Error("Failed to update scheduled deposit");
  }

  // Pause = active true → false. Resume (false → true) goes under
  // `scheduled_deposit_updated` since the enum reserves `_paused` for the
  // pause direction only.
  const actionKind =
    before.active && !newActive
      ? ("scheduled_deposit_paused" as const)
      : ("scheduled_deposit_updated" as const);

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind,
    targetKind: "scheduled_deposit",
    targetId: updated.id,
    before,
    after: updated,
  });

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_toggled`);
}

// Patient settings update — display name plus the jsonb settings keys the
// patient page actually reads (font_size, locale, currency). Settings merge
// over any existing keys so adding a new key later doesn't drop data that
// older rows already store. Currency is not caregiver-configurable: it is
// derived from the locale's region (M9 round-2 review — a visible currency
// option reads "not my bank"; a bank uses the currency of its country).
const fontSizeSchema = z.enum(["lg", "xl", "2xl"]);
const localeSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}-[A-Z]{2}$/, "Use a locale like en-US or fr-FR.");

const updatePatientSettingsSchema = z.object({
  patientId: uuid,
  displayName: z.string().trim().min(1, "Display name is required.").max(60),
  fontSize: fontSizeSchema,
  locale: localeSchema,
});

export async function updatePatientSettingsAction(
  formData: FormData,
): Promise<void> {
  const parsed = updatePatientSettingsSchema.safeParse({
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

  const oldSettings = (patient.settings ?? {}) as Record<string, unknown>;
  const newSettings = {
    ...oldSettings,
    font_size: parsed.data.fontSize,
    locale: parsed.data.locale,
    currency: currencyForLocale(parsed.data.locale),
  };

  const [updated] = await db
    .update(patients)
    .set({
      displayName: parsed.data.displayName,
      settings: newSettings,
    })
    .where(eq(patients.id, patient.id))
    .returning();
  if (!updated) {
    throw new Error("Failed to update patient settings");
  }

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind: "patient_settings_updated",
    targetKind: "patient",
    targetId: patient.id,
    before: { displayName: patient.displayName, settings: patient.settings },
    after: { displayName: updated.displayName, settings: updated.settings },
  });

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=settings_updated`);
}

const renameAccountSchema = z.object({
  patientId: uuid,
  accountId: uuid,
  name: z.string().trim().min(1, "Account name is required.").max(40),
});

export async function renameAccountAction(formData: FormData): Promise<void> {
  const parsed = renameAccountSchema.safeParse({
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

  const [before] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, parsed.data.accountId),
        eq(accounts.patientId, patient.id),
      ),
    )
    .limit(1);
  if (!before) {
    bouncePatient(patient.id, "Account does not belong to this patient.");
  }
  if (before.name === parsed.data.name) {
    // No-op rename — don't write an audit row for nothing.
    redirect(`/caregiver/patients/${patient.id}`);
  }

  const [updated] = await db
    .update(accounts)
    .set({ name: parsed.data.name })
    .where(eq(accounts.id, parsed.data.accountId))
    .returning();
  if (!updated) {
    throw new Error("Failed to rename account");
  }

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind: "account_renamed",
    targetKind: "account",
    targetId: updated.id,
    before: { name: before.name },
    after: { name: updated.name },
  });

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=account_renamed`);
}

const deleteScheduledDepositSchema = z.object({
  patientId: uuid,
  depositId: uuid,
});

export async function deleteScheduledDepositAction(
  formData: FormData,
): Promise<void> {
  const parsed = deleteScheduledDepositSchema.safeParse({
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

  // Read the full row for the audit-log `before` snapshot AND verify
  // ownership in the same query.
  const rows = await db
    .select({ sd: scheduledDeposits })
    .from(scheduledDeposits)
    .innerJoin(accounts, eq(accounts.id, scheduledDeposits.accountId))
    .where(
      and(
        eq(scheduledDeposits.id, parsed.data.depositId),
        eq(accounts.patientId, patient.id),
      ),
    )
    .limit(1);
  const before = rows[0]?.sd;
  if (!before) {
    bouncePatient(patient.id, "Scheduled deposit not found.");
  }

  // Materialized transactions tied to this scheduled deposit retain their
  // history. The FK on transactions.scheduled_deposit_id is `set null on
  // delete`, so deleting the schedule does not erase the patient's
  // transaction record.
  await db
    .delete(scheduledDeposits)
    .where(eq(scheduledDeposits.id, parsed.data.depositId));

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind: "scheduled_deposit_deleted",
    targetKind: "scheduled_deposit",
    targetId: before.id,
    before,
  });

  revalidatePath(`/caregiver/patients/${patient.id}`);
  redirect(`/caregiver/patients/${patient.id}?status=scheduled_deleted`);
}
