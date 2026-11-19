ALTER TABLE "member_event_settings" ALTER COLUMN "farm_share_bp" SET DEFAULT 3000;--> statement-breakpoint
ALTER TABLE "bank_settings" ADD COLUMN "purchase" text DEFAULT '{"restaurant":3000,"ite":3000}' NOT NULL;--> statement-breakpoint
-- Besluit eigenaar 9 november 2026: evenementen van leden standaard 30% voor de coöperatie (was 20%). Alleen als de oude standaard nog geldt.
UPDATE "member_event_settings" SET "farm_share_bp"=3000, "version"="version"+1 WHERE "id"='main' AND "farm_share_bp"=2000;
