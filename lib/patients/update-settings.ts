import { eq } from "drizzle-orm";
import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import { patients, type Patient } from "@/lib/db/schema";
import { currencyForLocale } from "@/lib/locale-currency";

// Shared core of "update patient settings" (display name + the jsonb settings
// keys the patient page reads: font_size, locale, currency). Currency is
// derived from the locale, not caregiver-configurable. Extracted from the web
// Server Action so the mobile endpoint behaves identically. Caller must first
// assert the caregiver owns `patientId`.

export const updatePatientSettingsInput = z.object({
  patientId: z.string().uuid(),
  displayName: z.string().trim().min(1, "Display name is required.").max(60),
  fontSize: z.enum(["lg", "xl", "2xl"]),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}-[A-Z]{2}$/, "Use a locale like en-US or fr-FR."),
});

export type UpdatePatientSettingsInput = z.infer<
  typeof updatePatientSettingsInput
>;

export async function updatePatientSettings(
  db: AppDatabase,
  args: { caregiverId: string } & UpdatePatientSettingsInput,
): Promise<Patient> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, args.patientId))
    .limit(1);
  if (!patient) {
    throw new Error("Patient not found.");
  }

  const oldSettings = (patient.settings ?? {}) as Record<string, unknown>;
  const newSettings = {
    ...oldSettings,
    font_size: args.fontSize,
    locale: args.locale,
    currency: currencyForLocale(args.locale),
  };

  const [updated] = await db
    .update(patients)
    .set({ displayName: args.displayName, settings: newSettings })
    .where(eq(patients.id, args.patientId))
    .returning();
  if (!updated) {
    throw new Error("Failed to update patient settings");
  }

  await logCaregiverAction(db, {
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind: "patient_settings_updated",
    targetKind: "patient",
    targetId: args.patientId,
    before: { displayName: patient.displayName, settings: patient.settings },
    after: { displayName: updated.displayName, settings: updated.settings },
  });

  return updated;
}
