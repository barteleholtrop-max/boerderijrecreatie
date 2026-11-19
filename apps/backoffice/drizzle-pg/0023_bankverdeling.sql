CREATE TABLE "bank_inflows" (
	"bunq_id" bigint PRIMARY KEY NOT NULL,
	"week" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_inflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"accounts" text DEFAULT '{}' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "bank_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bank_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_split_transfers" (
	"week" text NOT NULL,
	"target" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"iban" text NOT NULL,
	"status" text DEFAULT 'nieuw' NOT NULL,
	"bunq_id" bigint,
	"error" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	CONSTRAINT "bank_split_transfers_week_target_pk" PRIMARY KEY("week","target"),
	CONSTRAINT "bank_split_transfers_status" CHECK (status in ('nieuw','bezig','verstuurd','fout')),
	CONSTRAINT "bank_split_transfers_amount" CHECK (amount_cents>0)
);
--> statement-breakpoint
ALTER TABLE "bank_split_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_splits" (
	"week" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"snapshot" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" text NOT NULL,
	"done_at" text,
	CONSTRAINT "bank_splits_status" CHECK (status in ('goedgekeurd','uitgevoerd'))
);
--> statement-breakpoint
ALTER TABLE "bank_splits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bb_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"iban_sealed" text NOT NULL,
	"iban_last4" text NOT NULL,
	"holder" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" text NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"from_account_id" bigint,
	"bunq_draft_id" bigint,
	"note" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "bb_payouts_status" CHECK (status in ('aangevraagd','in-bunq','aandacht','uitbetaald','afgewezen','geweigerd-in-bunq')),
	CONSTRAINT "bb_payouts_amount" CHECK (amount_cents>0)
);
--> statement-breakpoint
ALTER TABLE "bb_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bunq_session" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"data_sealed" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "bunq_session_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bunq_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_inflows" ADD CONSTRAINT "bank_inflows_week_bank_splits_week_fk" FOREIGN KEY ("week") REFERENCES "public"."bank_splits"("week") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_split_transfers" ADD CONSTRAINT "bank_split_transfers_week_bank_splits_week_fk" FOREIGN KEY ("week") REFERENCES "public"."bank_splits"("week") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bb_payouts" ADD CONSTRAINT "bb_payouts_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_inflows_week" ON "bank_inflows" USING btree ("week");--> statement-breakpoint
CREATE INDEX "bb_payouts_participant" ON "bb_payouts" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bb_payouts_one_open" ON "bb_payouts" USING btree ("participant_id") WHERE status in ('aangevraagd','in-bunq','aandacht');