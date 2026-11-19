CREATE TABLE "member_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"read_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_messages" ADD CONSTRAINT "member_messages_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_messages_participant_at" ON "member_messages" USING btree ("participant_id","at");