-- Gezamenlijke rekening (wens eigenaar 5 november 2026): gasten openen zelf een rekening, betalen in delen (splitsen) en krijgen altijd een factuur.
CREATE TABLE "group_bill_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"group_code_id" text NOT NULL,
	"position" bigint NOT NULL,
	"count" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"external_ref" text,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"paid_by" text DEFAULT '' NOT NULL,
	"paid_at" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "origin" text DEFAULT 'backoffice' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "holder_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "holder_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "holder_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "holder_token_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "invoice_number" bigint;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "paid_at" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_bill_shares" ADD CONSTRAINT "group_bill_shares_group_code_id_group_codes_id_fk" FOREIGN KEY ("group_code_id") REFERENCES "public"."group_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_bill_shares_provider_external_ref_unique" ON "group_bill_shares" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "group_bill_shares_group_idx" ON "group_bill_shares" USING btree ("group_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_codes_invoice_number_unique" ON "group_codes" USING btree ("invoice_number");--> statement-breakpoint
-- Afscherming voor Supabase (zie 0002_afscherming): ook de nieuwe tabel krijgt beveiliging per rij, zonder regels.
ALTER TABLE "group_bill_shares" ENABLE ROW LEVEL SECURITY;
