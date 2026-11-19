ALTER TABLE "group_codes" ADD COLUMN "kind" text DEFAULT 'groep' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "warn_cents" bigint;