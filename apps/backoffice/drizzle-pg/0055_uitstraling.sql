-- Uitstraling van de bestelapp (wens eigenaar 9 november 2026): gekozen bij Website & uitstraling, gelezen via /api/public/order-options.
CREATE TABLE "website_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"uitstraling" text DEFAULT 'klassiek' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "website_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "website_settings" ENABLE ROW LEVEL SECURITY;