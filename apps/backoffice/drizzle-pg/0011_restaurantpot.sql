-- Restaurantpot per dag en weekafrekening (besluit eigenaar 5 november 2026): per lid per dag één rol, en de goedgekeurde
-- weken als vaste momentopname. Supabase-indeling met beveiliging per rij.
CREATE TABLE "pot_shifts" (
	"pot" text NOT NULL,
	"day" text NOT NULL,
	"participant_id" text NOT NULL,
	"role_id" text NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "pot_shifts_pot_day_participant_id_pk" PRIMARY KEY("pot","day","participant_id")
);
--> statement-breakpoint
CREATE TABLE "pot_weeks" (
	"pot" text NOT NULL,
	"week" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" text NOT NULL,
	"paid_by" text,
	"paid_at" text,
	CONSTRAINT "pot_weeks_pot_week_pk" PRIMARY KEY("pot","week")
);
--> statement-breakpoint
ALTER TABLE "pot_shifts" ADD CONSTRAINT "pot_shifts_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot_shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pot_weeks" ENABLE ROW LEVEL SECURITY;
