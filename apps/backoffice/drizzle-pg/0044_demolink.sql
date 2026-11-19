CREATE TABLE "demo_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"expires" text NOT NULL,
	"revoked" text DEFAULT '' NOT NULL,
	CONSTRAINT "demo_links_one" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "demo_links" ENABLE ROW LEVEL SECURITY;