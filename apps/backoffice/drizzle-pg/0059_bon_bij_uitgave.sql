ALTER TABLE "unit_fund_entries" ADD COLUMN "receipt_key" text;--> statement-breakpoint
ALTER TABLE "unit_fund_entries" ADD COLUMN "receipt_mime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_fund_entries" ADD COLUMN "receipt_at" text;