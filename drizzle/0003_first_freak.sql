CREATE TYPE "public"."audit_action_kind" AS ENUM('patient_created', 'patient_settings_updated', 'account_created', 'account_renamed', 'transaction_created', 'scheduled_deposit_created', 'scheduled_deposit_updated', 'scheduled_deposit_paused', 'scheduled_deposit_deleted', 'check_code_generated', 'workbook_code_generated', 'transfer_made', 'code_voided');--> statement-breakpoint
CREATE TYPE "public"."audit_target_kind" AS ENUM('patient', 'account', 'transaction', 'scheduled_deposit', 'deposit_code');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"patient_id" uuid,
	"action_kind" "audit_action_kind" NOT NULL,
	"target_kind" "audit_target_kind" NOT NULL,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD COLUMN "target_account_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_deposits" ADD COLUMN "pending_days" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_caregiver_patient_created_idx" ON "audit_log" USING btree ("caregiver_id","patient_id","created_at");--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD CONSTRAINT "deposit_codes_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_transfer_id_idx" ON "transactions" USING btree ("transfer_id") WHERE "transactions"."transfer_id" is not null;--> statement-breakpoint
ALTER TABLE "scheduled_deposits" ADD CONSTRAINT "scheduled_deposits_pending_days_range" CHECK ("scheduled_deposits"."pending_days" >= 0 AND "scheduled_deposits"."pending_days" <= 14);