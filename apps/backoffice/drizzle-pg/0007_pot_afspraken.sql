-- Pot-afspraken (besluit eigenaar 5 november 2026): percentage, rollen met punten en fooiregel per pot; een voorstel geldt pas
-- na instemming van alle leden van de pot (ledenkaart of vergadering). Elke versie blijft bewaard. Supabase-indeling met RLS.
CREATE TABLE "pot_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"pot" text NOT NULL,
	"valid_from" text NOT NULL,
	"percent_bp" bigint NOT NULL,
	"roles" text DEFAULT '[]' NOT NULL,
	"tip_rule" text DEFAULT 'gelijk' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"required" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'voorstel' NOT NULL,
	"proposed_by" text DEFAULT '' NOT NULL,
	"proposed_at" text NOT NULL,
	"decided_at" text,
	"version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pot_consents" (
	"agreement_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"decision" text NOT NULL,
	"via" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "pot_consents_agreement_id_participant_id_pk" PRIMARY KEY("agreement_id","participant_id")
);
--> statement-breakpoint
ALTER TABLE "pot_consents" ADD CONSTRAINT "pot_consents_agreement_id_pot_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."pot_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot_consents" ADD CONSTRAINT "pot_consents_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pot_agreements_pot" ON "pot_agreements" USING btree ("pot","status","valid_from");--> statement-breakpoint
ALTER TABLE "pot_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pot_consents" ENABLE ROW LEVEL SECURITY;
