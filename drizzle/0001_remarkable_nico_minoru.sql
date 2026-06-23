-- Add label with a transient default so existing rows backfill cleanly,
-- then drop the default so future inserts must supply the value explicitly.
ALTER TABLE "deposit_codes" ADD COLUMN "label" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "deposit_codes" ALTER COLUMN "label" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "deposit_codes" ADD COLUMN "memo" text;