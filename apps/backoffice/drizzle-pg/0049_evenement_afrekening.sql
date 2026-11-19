CREATE TABLE "member_event_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"revenue_cents" bigint NOT NULL,
	"farm_cents" bigint NOT NULL,
	"coffee_cents" bigint NOT NULL,
	"payout_cents" bigint NOT NULL,
	"bb_cents" bigint DEFAULT 0 NOT NULL,
	"due_cents" bigint DEFAULT 0 NOT NULL,
	"route" text NOT NULL,
	"status" text NOT NULL,
	"iban_sealed" text,
	"iban_last4" text DEFAULT '' NOT NULL,
	"holder" text DEFAULT '' NOT NULL,
	"from_account_id" bigint,
	"bunq_draft_id" bigint,
	"created_at" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"decided_at" text,
	"decided_by" text,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "member_event_settlements_route" CHECK (route in ('bb','bunq','bb-af','niets')),
	CONSTRAINT "member_event_settlements_status" CHECK (status in ('geboekt','klaar','in-bunq','aandacht','uitbetaald','geweigerd-in-bunq','te-ontvangen','ontvangen'))
);
--> statement-breakpoint
ALTER TABLE "member_event_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bb_entries" DROP CONSTRAINT "bb_entries_kind";--> statement-breakpoint
ALTER TABLE "member_event_settlements" ADD CONSTRAINT "member_event_settlements_id_member_events_id_fk" FOREIGN KEY ("id") REFERENCES "public"."member_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_event_settlements" ADD CONSTRAINT "member_event_settlements_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_event_settlements_participant" ON "member_event_settlements" USING btree ("participant_id");--> statement-breakpoint
ALTER TABLE "bb_entries" ADD CONSTRAINT "bb_entries_kind" CHECK (kind in ('pot-week','winkel-week','correctie','opname','besteding','ruil','inkomenslening','aflossing','evenement'));