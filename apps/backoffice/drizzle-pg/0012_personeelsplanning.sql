-- Personeelsplanning (besluit eigenaar 5 november 2026): leden claimen een rol (gepland) en melden zich op de tablet aan
-- (aanwezig); een lid kan meer rollen op een dag hebben; per rol hoeveel mensen nodig zijn. Supabase-indeling met beveiliging per rij.
CREATE TABLE "pot_needs" (
	"pot" text NOT NULL,
	"day" text NOT NULL,
	"role_id" text NOT NULL,
	"count" bigint NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "pot_needs_pot_day_role_id_pk" PRIMARY KEY("pot","day","role_id")
);
--> statement-breakpoint
ALTER TABLE "pot_shifts" DROP CONSTRAINT "pot_shifts_pot_day_participant_id_pk";--> statement-breakpoint
ALTER TABLE "pot_shifts" ADD CONSTRAINT "pot_shifts_pot_day_participant_id_role_id_pk" PRIMARY KEY("pot","day","participant_id","role_id");--> statement-breakpoint
ALTER TABLE "pot_shifts" ADD COLUMN "status" text DEFAULT 'aanwezig' NOT NULL;--> statement-breakpoint
ALTER TABLE "pot_needs" ENABLE ROW LEVEL SECURITY;
