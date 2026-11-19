-- Betalen met dividend (wens eigenaar 5 november 2026): telefoons die een lid via zijn ledenlink koppelde.
CREATE TABLE "member_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created" text NOT NULL,
	"last_used" text,
	CONSTRAINT "member_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "member_devices" ADD CONSTRAINT "member_devices_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_devices_participant_idx" ON "member_devices" USING btree ("participant_id");--> statement-breakpoint
-- Afscherming voor Supabase (zie 0002_afscherming): beveiliging per rij, zonder regels.
ALTER TABLE "member_devices" ENABLE ROW LEVEL SECURITY;
