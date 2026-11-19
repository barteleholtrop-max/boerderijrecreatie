CREATE TABLE "forecast_log" (
	"date" text PRIMARY KEY NOT NULL,
	"predicted" bigint NOT NULL,
	"temperature" double precision NOT NULL,
	"rain" double precision NOT NULL,
	"at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forecast_overrides" (
	"date" text PRIMARY KEY NOT NULL,
	"visitors" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forecast_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"auto" bigint DEFAULT 1 NOT NULL,
	"period_days" bigint DEFAULT 28 NOT NULL,
	"manual_pct" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "forecast_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "forecast_settings" ENABLE ROW LEVEL SECURITY;