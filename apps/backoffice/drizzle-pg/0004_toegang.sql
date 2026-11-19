CREATE TABLE "access_accounts" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'medewerker' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"last_login" text
);
--> statement-breakpoint
ALTER TABLE "access_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Eigenaar vanaf het begin (besluit eigenaar 4 november 2026): administratie@boerbart.nl.
INSERT INTO "access_accounts" ("email","name","role","active","created","created_by","updated","updated_by") VALUES ('administratie@boerbart.nl','Administratie Boer Bart','eigenaar',1,'2026-11-04T00:00:00.000Z','besluit eigenaar','2026-11-04T00:00:00.000Z','besluit eigenaar') ON CONFLICT DO NOTHING;
