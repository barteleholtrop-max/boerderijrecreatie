CREATE TABLE "station_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "station_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "station_settings" ENABLE ROW LEVEL SECURITY;