CREATE TABLE "member_calendar_links" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_sealed" text NOT NULL,
	"created" text NOT NULL,
	"last_used" text
);
--> statement-breakpoint
ALTER TABLE "member_calendar_links" ADD CONSTRAINT "member_calendar_links_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_calendar_links_hash" ON "member_calendar_links" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "member_calendar_links" ENABLE ROW LEVEL SECURITY;