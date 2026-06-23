import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["checking", "savings"]);

export const transactionKindEnum = pgEnum("transaction_kind", [
  "deposit",
  "withdrawal",
  "fee",
  "adjustment",
]);

export const transactionSourceEnum = pgEnum("transaction_source", [
  "scheduled",
  "code",
  "manual",
  "computed_balance",
]);

export const depositFrequencyEnum = pgEnum("deposit_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

export const depositCodeKindEnum = pgEnum("deposit_code_kind", [
  "check",
  "workbook",
]);

export const depositCodeStatusEnum = pgEnum("deposit_code_status", [
  "unused",
  "used",
]);

// Caregiver-side categorisation of a workbook code. Patient-facing UI never
// references these labels — patients see neutral terms like "Activity Set."
export const workbookKindEnum = pgEnum("workbook_kind", [
  "math",
  "reading",
  "mixed",
]);

// Caregiver-side audit log enums. `code_voided` is reserved for a future
// milestone — never emitted in M4. Adding it now means the future feature
// is a non-breaking enum extension.
export const auditActionKindEnum = pgEnum("audit_action_kind", [
  "patient_created",
  "patient_settings_updated",
  "account_created",
  "account_renamed",
  "transaction_created",
  "scheduled_deposit_created",
  "scheduled_deposit_updated",
  "scheduled_deposit_paused",
  "scheduled_deposit_deleted",
  "check_code_generated",
  "workbook_code_generated",
  "transfer_made",
  "code_voided",
]);

export const auditTargetKindEnum = pgEnum("audit_target_kind", [
  "patient",
  "account",
  "transaction",
  "scheduled_deposit",
  "deposit_code",
]);

export const caregivers = pgTable("caregivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  caregiverId: uuid("caregiver_id")
    .notNull()
    .references(() => caregivers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  settings: jsonb("settings")
    .notNull()
    .default(
      sql`'{"font_size":"lg","locale":"en-US","currency":"USD"}'::jsonb`,
    ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  balanceCents: bigint("balance_cents", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scheduledDeposits = pgTable(
  "scheduled_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    frequency: depositFrequencyEnum("frequency").notNull(),
    anchorDate: date("anchor_date").notNull(),
    nextRunAt: date("next_run_at").notNull(),
    active: boolean("active").notNull().default(true),
    // How many days before next_run_at this deposit shows on the patient's
    // home as "pending." Caregiver-set per scheduled deposit; default 5.
    // CHECK constraint guards the 0..14 range at the DB level.
    pendingDays: smallint("pending_days").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "scheduled_deposits_pending_days_range",
      sql`${t.pendingDays} >= 0 AND ${t.pendingDays} <= 14`,
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: transactionKindEnum("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    label: text("label").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    source: transactionSourceEnum("source").notNull(),
    // Idempotency anchor for scheduled-deposit materialization.
    scheduledDepositId: uuid("scheduled_deposit_id").references(
      () => scheduledDeposits.id,
      { onDelete: "set null" },
    ),
    scheduledOccurrenceDate: date("scheduled_occurrence_date"),
    // Both legs of a caregiver-initiated transfer share this value. Null on
    // every non-transfer transaction. NOT a foreign key — it's a
    // self-grouping id, not a reference to a parent row.
    transferId: uuid("transfer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_scheduled_occurrence_uniq")
      .on(t.scheduledDepositId, t.scheduledOccurrenceDate)
      .where(sql`${t.scheduledDepositId} is not null`),
    index("transactions_transfer_id_idx")
      .on(t.transferId)
      .where(sql`${t.transferId} is not null`),
  ],
);

export const depositCodes = pgTable("deposit_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  kind: depositCodeKindEnum("kind").notNull(),
  // Caregiver's name for this check ("Birthday from Aunt Susan"). Inherited
  // as the transaction label when the code is redeemed.
  label: text("label").notNull(),
  // Optional "for ___" line printed on the check itself.
  memo: text("memo"),
  // Workbook-only columns. Null for kind='check'. Application layer enforces
  // the invariant — same pattern as memo (check-only, null for workbooks).
  workbookKind: workbookKindEnum("workbook_kind"),
  workbookGrade: smallint("workbook_grade"),
  // Snapshot of the exact problems printed on the workbook PDF, so the
  // caregiver answer-key view always matches the printed copy even if the
  // upstream problem bank changes. Source-agnostic: future Anthropic-API
  // generation populates this column the same way the static bank does.
  contentSeed: jsonb("content_seed"),
  // Caregiver-set destination at code-generation time. Null means "fall
  // back to the patient's first-created account" — preserves M2/M3
  // semantics for any pre-M4 rows. Codes generated under M4 always set
  // this explicitly; null only persists in legacy data.
  targetAccountId: uuid("target_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  status: depositCodeStatusEnum("status").notNull().default("unused"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caregiverId: uuid("caregiver_id")
      .notNull()
      .references(() => caregivers.id, { onDelete: "cascade" }),
    // Null for caregiver-level actions that don't belong to a single patient.
    patientId: uuid("patient_id").references(() => patients.id, {
      onDelete: "set null",
    }),
    actionKind: auditActionKindEnum("action_kind").notNull(),
    targetKind: auditTargetKindEnum("target_kind").notNull(),
    // Null for actions that affect more than one row of the same kind — the
    // primary entity convention falls down in that edge case; secondary IDs
    // live in the `after` payload.
    targetId: uuid("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_caregiver_patient_created_idx").on(
      t.caregiverId,
      t.patientId,
      t.createdAt,
    ),
  ],
);

// One-time MFA recovery codes for a caregiver who enabled TOTP two-factor.
// Supabase TOTP has no native recovery codes (see docs/specs/M7.md Risk #1),
// so we store our own. Never holds the plaintext code — only a per-row
// salted scrypt hash ("scrypt$<saltHex>$<hashHex>"). Single-use: usedAt is
// stamped on consumption. Regenerating a caregiver's set deletes the old
// rows, so the prior codes stop verifying immediately.
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caregiverId: uuid("caregiver_id")
      .notNull()
      .references(() => caregivers.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("mfa_recovery_codes_caregiver_idx").on(t.caregiverId)],
);

export type Caregiver = typeof caregivers.$inferSelect;
export type NewCaregiver = typeof caregivers.$inferInsert;
export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type ScheduledDeposit = typeof scheduledDeposits.$inferSelect;
export type NewScheduledDeposit = typeof scheduledDeposits.$inferInsert;
export type DepositCode = typeof depositCodes.$inferSelect;
export type NewDepositCode = typeof depositCodes.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type MfaRecoveryCode = typeof mfaRecoveryCodes.$inferSelect;
export type NewMfaRecoveryCode = typeof mfaRecoveryCodes.$inferInsert;
