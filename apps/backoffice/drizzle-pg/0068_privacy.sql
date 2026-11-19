CREATE TABLE "privacy_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "privacy_policy_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "privacy_policy" ENABLE ROW LEVEL SECURITY;