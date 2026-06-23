CREATE TYPE "public"."workbook_kind" AS ENUM('math', 'reading', 'mixed');--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD COLUMN "workbook_kind" "workbook_kind";--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD COLUMN "workbook_grade" smallint;--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD COLUMN "content_seed" jsonb;