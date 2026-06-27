import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { logCaregiverAction, type AppDatabase } from "@/lib/audit-log";
import {
  accounts,
  scheduledDeposits,
  type ScheduledDeposit,
} from "@/lib/db/schema";
import { dollarsString, dollarsToCents } from "@/lib/money";

// Shared core of the caregiver scheduled-deposit actions (add / pause-resume /
// delete), extracted from the web Server Actions so the mobile API endpoints
// behave identically. Callers must first assert the caregiver owns `patientId`.

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

export const addScheduledDepositInput = z.object({
  patientId: uuid,
  accountId: uuid,
  label: z.string().trim().min(1, "Label is required.").max(60),
  amount: dollarsString,
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  anchorDate: isoDate,
  // 0..14 inclusive; empty coerces to the 5-day default.
  pendingDays: z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? 5 : v),
      z.coerce.number().int().min(0).max(14),
    )
    .default(5),
});

export type AddScheduledDepositInput = z.infer<typeof addScheduledDepositInput>;

async function assertAccountOwned(
  db: AppDatabase,
  patientId: string,
  accountId: string,
): Promise<void> {
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.patientId, patientId)))
    .limit(1);
  if (!owned[0]) {
    throw new Error("Account does not belong to this patient.");
  }
}

export async function addScheduledDeposit(
  db: AppDatabase,
  args: { caregiverId: string } & AddScheduledDepositInput,
): Promise<ScheduledDeposit> {
  await assertAccountOwned(db, args.patientId, args.accountId);

  const [inserted] = await db
    .insert(scheduledDeposits)
    .values({
      accountId: args.accountId,
      label: args.label,
      amountCents: dollarsToCents(args.amount),
      frequency: args.frequency,
      anchorDate: args.anchorDate,
      nextRunAt: args.anchorDate,
      pendingDays: args.pendingDays,
    })
    .returning();
  if (!inserted) {
    throw new Error("Failed to create scheduled deposit");
  }

  await logCaregiverAction(db, {
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind: "scheduled_deposit_created",
    targetKind: "scheduled_deposit",
    targetId: inserted.id,
    after: inserted,
  });

  return inserted;
}

export const toggleScheduledDepositInput = z.object({
  patientId: uuid,
  depositId: uuid,
  active: z.boolean(),
});

export type ToggleScheduledDepositInput = z.infer<
  typeof toggleScheduledDepositInput
>;

// Confirms the deposit's account belongs to the patient and reads the prior row
// for the audit snapshot in one pass.
async function ownedDeposit(
  db: AppDatabase,
  patientId: string,
  depositId: string,
): Promise<ScheduledDeposit> {
  const rows = await db
    .select({ sd: scheduledDeposits })
    .from(scheduledDeposits)
    .innerJoin(accounts, eq(accounts.id, scheduledDeposits.accountId))
    .where(
      and(
        eq(scheduledDeposits.id, depositId),
        eq(accounts.patientId, patientId),
      ),
    )
    .limit(1);
  const before = rows[0]?.sd;
  if (!before) {
    throw new Error("Scheduled deposit not found.");
  }
  return before;
}

export async function toggleScheduledDeposit(
  db: AppDatabase,
  args: { caregiverId: string } & ToggleScheduledDepositInput,
): Promise<ScheduledDeposit> {
  const before = await ownedDeposit(db, args.patientId, args.depositId);

  const [updated] = await db
    .update(scheduledDeposits)
    .set({ active: args.active })
    .where(eq(scheduledDeposits.id, args.depositId))
    .returning();
  if (!updated) {
    throw new Error("Failed to update scheduled deposit");
  }

  // Pause = active true → false. Resume (false → true) is logged as a generic
  // update since the enum reserves `_paused` for the pause direction only.
  const actionKind =
    before.active && !args.active
      ? ("scheduled_deposit_paused" as const)
      : ("scheduled_deposit_updated" as const);

  await logCaregiverAction(db, {
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind,
    targetKind: "scheduled_deposit",
    targetId: updated.id,
    before,
    after: updated,
  });

  return updated;
}

export const deleteScheduledDepositInput = z.object({
  patientId: uuid,
  depositId: uuid,
});

export type DeleteScheduledDepositInput = z.infer<
  typeof deleteScheduledDepositInput
>;

export async function deleteScheduledDeposit(
  db: AppDatabase,
  args: { caregiverId: string } & DeleteScheduledDepositInput,
): Promise<void> {
  const before = await ownedDeposit(db, args.patientId, args.depositId);

  // Materialized transactions retain their history (FK is set null on delete).
  await db
    .delete(scheduledDeposits)
    .where(eq(scheduledDeposits.id, args.depositId));

  await logCaregiverAction(db, {
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind: "scheduled_deposit_deleted",
    targetKind: "scheduled_deposit",
    targetId: before.id,
    before,
  });
}
