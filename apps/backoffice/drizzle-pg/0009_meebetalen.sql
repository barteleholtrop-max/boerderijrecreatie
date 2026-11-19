-- Meebetalen aan een gezamenlijke rekening (wens eigenaar 5 november 2026): delen per persoon met een zelfgekozen bedrag.
ALTER TABLE "group_bill_shares" ADD COLUMN "payer_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_bill_shares" ADD COLUMN "payer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_bill_shares" ADD COLUMN "paid_cents" bigint;