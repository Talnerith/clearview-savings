"use server";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logCaregiverAction } from "@/lib/audit-log";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { accounts, depositCodes } from "@/lib/db/schema";
import { generateCode } from "@/lib/deposit-codes";
import {
  newWorkbookSeed,
  sampleWorkbookContent,
} from "@/lib/workbook-content";

const dollarsString = z
  .string()
  .trim()
  .min(1, "Reward amount is required.")
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount like 5.00.");

function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

const createWorkbookSchema = z.object({
  patientId: z.string().uuid(),
  // Caregiver-picked destination account. Form sends this even when only one
  // account exists (hidden input), so target_account_id is always concrete on
  // new rows.
  accountId: z.string().uuid("Pick an account."),
  grade: z
    .enum(["0", "1", "2", "3"])
    .transform((v) => Number(v) as 0 | 1 | 2 | 3),
  kind: z.enum(["math", "reading", "mixed"]),
  amount: dollarsString,
  // Optional caregiver-supplied title; falls back to "Activity Set #N".
  title: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

const MAX_CODE_RETRIES = 5;

export async function createWorkbookAction(formData: FormData): Promise<void> {
  const parsed = createWorkbookSchema.safeParse({
    patientId: formData.get("patientId"),
    accountId: formData.get("accountId"),
    grade: formData.get("grade"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    title: formData.get("title") ?? undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    const patientId = (formData.get("patientId") as string | null) ?? "";
    redirect(
      `/caregiver/patients/${patientId}/workbooks?error=${encodeURIComponent(message)}`,
    );
  }

  const { patient, caregiver } = await getPatientForCaregiver(
    parsed.data.patientId,
  );

  // Verify the picked account belongs to this patient.
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
      `/caregiver/patients/${patient.id}/workbooks?error=${encodeURIComponent(
        "Pick an account that belongs to this patient.",
      )}`,
    );
  }

  const amountCents = dollarsToCents(parsed.data.amount);

  // Auto-title falls back to "Activity Set #N" where N is the count of prior
  // workbook rows for this patient + 1. Since M8 (ADR 0004) workbook rewards
  // are minted as kind = "check", so workbook-ness is the presence of workbook
  // content (workbook_kind), not the code kind. The label becomes the
  // transaction's display label on the patient's Recent Transactions view, so
  // it must read like a real bank line item — "Activity Set #12" is fine; raw
  // category / grade is not.
  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(depositCodes)
    .where(
      and(
        eq(depositCodes.patientId, patient.id),
        isNotNull(depositCodes.workbookKind),
      ),
    );
  const priorCount = countRows[0]?.n ?? 0;
  const title = parsed.data.title ?? `Activity Set #${priorCount + 1}`;

  const sample = sampleWorkbookContent({
    kind: parsed.data.kind,
    grade: parsed.data.grade,
    seed: newWorkbookSeed(),
  });

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
          // Per ADR 0004 the workbook reward IS a check: minted as kind
          // "check" and redeemed through the patient "Deposit a Check" flow.
          // workbook_kind below is what marks the row as a workbook (carrying
          // the printed content) and separates it from a plain check.
          kind: "check",
          label: title,
          memo: null,
          workbookKind: parsed.data.kind,
          workbookGrade: parsed.data.grade,
          contentSeed: sample,
          targetAccountId: parsed.data.accountId,
        })
        .returning();
      inserted = rows[0];
      break;
    } catch (err) {
      lastError = err;
      if (!(err instanceof Error) || !/unique|duplicate/i.test(err.message)) {
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
    actionKind: "workbook_code_generated",
    targetKind: "deposit_code",
    targetId: insertedId,
    // Don't snapshot the full contentSeed in the audit log — it's a large
    // blob (500-problem workbook) and already lives on the deposit_codes
    // row. Strip it from the after payload to keep audit_log entries small.
    after: { ...inserted, contentSeed: "[omitted]" },
  });

  revalidatePath(`/caregiver/patients/${patient.id}/workbooks`);
  redirect(
    `/caregiver/patients/${patient.id}/workbooks?status=just-generated&codeId=${insertedId}`,
  );
}
