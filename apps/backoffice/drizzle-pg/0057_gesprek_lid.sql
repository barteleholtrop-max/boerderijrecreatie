-- Gesprek voor een lid (wens eigenaar 10 november 2026), met beveiliging per rij.
CREATE TABLE "conversation_members" (
	"ref" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"assigned_by" text DEFAULT '' NOT NULL,
	"assigned_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_members_participant_idx" ON "conversation_members" USING btree ("participant_id");