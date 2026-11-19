CREATE TABLE "bb_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "bb_entries_kind" CHECK (kind in ('pot-week','winkel-week','correctie','opname','besteding','ruil'))
);
--> statement-breakpoint
ALTER TABLE "bb_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bb_entries" ADD CONSTRAINT "bb_entries_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bb_entries_source" ON "bb_entries" USING btree ("participant_id","source");--> statement-breakpoint
CREATE INDEX "bb_entries_member" ON "bb_entries" USING btree ("participant_id","day");