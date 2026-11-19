CREATE TABLE "rente_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"year" bigint NOT NULL,
	"bloei_member_id" text NOT NULL,
	"participant_id" text,
	"name" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"iban_sealed" text NOT NULL,
	"iban_last4" text NOT NULL,
	"holder" text NOT NULL,
	"detail" text DEFAULT '[]' NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"from_account_id" bigint,
	"bunq_draft_id" bigint,
	"note" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "rente_payouts_status" CHECK (status in ('klaar','in-bunq','aandacht','uitbetaald','afgewezen','geweigerd-in-bunq')),
	CONSTRAINT "rente_payouts_amount" CHECK (amount_cents>0)
);
--> statement-breakpoint
ALTER TABLE "rente_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rente_payouts" ADD CONSTRAINT "rente_payouts_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rente_payouts_year_member" ON "rente_payouts" USING btree ("year","bloei_member_id");--> statement-breakpoint
CREATE INDEX "rente_payouts_participant" ON "rente_payouts" USING btree ("participant_id");