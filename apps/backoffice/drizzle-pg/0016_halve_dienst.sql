-- Halve dienst, pushberichten naar leden en hulpvragen (wens eigenaar 5 november 2026). Supabase-indeling met beveiliging per rij.
CREATE TABLE "member_push" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created" text NOT NULL,
	"last_sent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pot_help_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"pot" text NOT NULL,
	"day" text NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"sent" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pot_shifts" ADD COLUMN "half" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_push" ADD CONSTRAINT "member_push_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_push_participant_endpoint_unique" ON "member_push" USING btree ("participant_id","endpoint");--> statement-breakpoint
CREATE INDEX "pot_help_calls_pot_day_idx" ON "pot_help_calls" USING btree ("pot","day");--> statement-breakpoint
ALTER TABLE "member_push" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pot_help_calls" ENABLE ROW LEVEL SECURITY;
