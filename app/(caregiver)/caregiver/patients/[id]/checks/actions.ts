"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { and, eq } from "drizzle-orm";

import { logCaregiverAction } from "@/lib/audit-log";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { accounts, depositCodes } from "@/lib/db/schema";
import { generateCode } from "@/lib/deposit-codes";

const dollarsString = z
  .string()
  .trim()
  .min(1, "Amount is required.")
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount like 50.00.");

function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

const createCheckSchema = z.object({
  patientId: z.string().uuid(),
  // Caregiver-picked destination account. The form sends this even when the
  // patient has a single account (hidden input with the single account's id)
  // so the deposit_codes row always has a concrete target. M2/M3 codes with
  // null target_account_id still fall back to the first-account path inside
  // redeemCode.
  accountId: z.string().uuid("Pick an account."),
  amount: dollarsString,
  label: z.string().trim().min(1, "Description is required.").max(60),
  memo: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

const MAX_CODE_RETRIES = 5;

export async function createCheckAction(formData: FormData): Promise<void> {
  const parsed = createCheckSchema.safeParse({
    patientId: formData.get("patientId"),
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    label: formData.get("label"),
    memo: formData.get("memo") ?? undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    redirect(
      `/caregiver/patients/${patientId}/checks?error=${encodeURIComponent(message)}`,
    );
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  // Verify the picked account belongs to this patient. Cheap guard against
  // a tampered hidden field.
  const ownedAccount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, parsed.data.accountId),
        eq(accounts.patientId, patient.id),
      ),
    )
    .limit(1);
  if (!ownedAccount[0]) {
    redirect(
      `/caregiver/patients/${patient.id}/checks?error=${encodeURIComponent(
        "Pick an account that belongs to this patient.",
      )}`,
    );
  }

  const amountCents = dollarsToCents(parsed.data.amount);

  // Insert the deposit_codes row, retrying on the rare unique-collision.
  let inserted: typeof depositCodes.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const code = generateCode();
    try {
      const rows = await db
        .insert(depositCodes)
        .values({
          patientId: patient.id,
          code,
          amountCents,
          kind: "check",
          label: parsed.data.label,
          memo: parsed.data.memo ?? null,
          targetAccountId: parsed.data.accountId,
        })
        .returning();
      inserted = rows[0];
      break;
    } catch (err) {
      lastError = err;
      // Retry only on unique violation; bubble anything else.
      if (
        !(err instanceof Error) ||
        !/unique|duplicate/i.test(err.message)
      ) {
        throw err;
      }
    }
  }
  if (!inserted) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to allocate a unique deposit code");
  }
  const insertedId = inserted.id;

  await logCaregiverAction(db, {
    caregiverId: caregiver.id,
    patientId: patient.id,
    actionKind: "check_code_generated",
    targetKind: "deposit_code",
    targetId: insertedId,
    after: inserted,
  });

  revalidatePath(`/caregiver/patients/${patient.id}/checks`);
  // Land back on the list with a status banner and the new row highlighted.
  // The banner carries an "Open the printable check ↗" button that opens the
  // PDF in a new tab — keeps the list available so the caregiver can reprint
  // or generate another without losing context.
  redirect(
    `/caregiver/patients/${patient.id}/checks?status=just-generated&codeId=${insertedId}`,
  );
}
