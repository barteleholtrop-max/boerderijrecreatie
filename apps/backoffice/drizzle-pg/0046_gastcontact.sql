-- Gastcontact (wensen eigenaar 9 november 2026): meldingen voor medewerkers (staff_push), kennisbank voor gastmail (guest_kb)
-- en afspraken met klanten (guest_appointments). Supabase-indeling met beveiliging per rij.
CREATE TABLE "guest_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_kb" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"answer" text NOT NULL,
	"source" text DEFAULT 'handmatig' NOT NULL,
	"source_note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'voorstel' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_push" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created" text NOT NULL,
	"last_sent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "guest_appointments_day_idx" ON "guest_appointments" USING btree ("day");--> statement-breakpoint
CREATE INDEX "guest_kb_status_idx" ON "guest_kb" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_push_account_endpoint_unique" ON "staff_push" USING btree ("account","endpoint");--> statement-breakpoint
ALTER TABLE "staff_push" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_kb" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_appointments" ENABLE ROW LEVEL SECURITY;
