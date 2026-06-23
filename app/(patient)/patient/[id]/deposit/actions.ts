"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { redeemCode, type RedeemResult } from "@/lib/deposit-codes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

// Per M2 spec the typed amount is theatre — the deposit posts the amount on
// the code, not whatever the patient typed. We deliberately do not read or
// pass the `amount` field from formData; this lock is asserted by tests.
export async function redeemCodeAction(formData: FormData): Promise<void> {
  const patientId = (formData.get("patientId") as string | null) ?? "";
  const rawCode = (formData.get("code") as string | null) ?? "";
  // Interior whitespace is stripped, not just trimmed: the code is printed
  // and entered in two 4-char groups ("ABCD 2345", M9), so a spaced
  // submission is the expected shape, not a typo.
  const code = rawCode.replace(/\s+/g, "").toUpperCase();

  if (!UUID_RE.test(patientId)) {
    redirect("/");
  }

  if (!CODE_RE.test(code)) {
    redirect(`/patient/${patientId}/deposit?error=invalid_or_used`);
  }

  let found: { id: string }[];
  try {
    found = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
  } catch {
    redirect(`/patient/${patientId}/deposit?error=invalid_or_used`);
  }
  if (found.length === 0) {
    redirect(`/patient/${patientId}`);
  }

  let result: RedeemResult;
  try {
    result = await redeemCode(db, { patientId, code });
  } catch {
    redirect(`/patient/${patientId}/deposit?error=invalid_or_used`);
  }

  if (!result.ok) {
    redirect(`/patient/${patientId}/deposit?error=invalid_or_used`);
  }

  redirect(
    `/patient/${patientId}/deposit/done?txId=${encodeURIComponent(
      result.transactionId,
    )}`,
  );
}
