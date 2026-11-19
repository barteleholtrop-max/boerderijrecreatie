CREATE TABLE "bb_choices" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"choice" text NOT NULL,
	"keep_cents" bigint,
	"keep_bp" bigint,
	"updated" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "bb_choices_choice" CHECK (choice in ('alles','laten','deel'))
);
--> statement-breakpoint
ALTER TABLE "bb_choices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"participant_id" text NOT NULL,
	"payout_id" text NOT NULL,
	"week" text NOT NULL,
	"date" text NOT NULL,
	"data" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"mail" text DEFAULT '' NOT NULL,
	"mail_error" text DEFAULT '' NOT NULL,
	CONSTRAINT "bb_documents_number_unique" UNIQUE("number"),
	CONSTRAINT "bb_documents_payout_id_unique" UNIQUE("payout_id"),
	CONSTRAINT "bb_documents_kind" CHECK (kind in ('creditfactuur','overzicht'))
);
--> statement-breakpoint
ALTER TABLE "bb_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bb_entries" ADD COLUMN "meta" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bb_entries" ADD COLUMN "document_id" text;--> statement-breakpoint
ALTER TABLE "bb_payouts" ADD COLUMN "week" text;--> statement-breakpoint
ALTER TABLE "bb_choices" ADD CONSTRAINT "bb_choices_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bb_documents" ADD CONSTRAINT "bb_documents_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bb_documents" ADD CONSTRAINT "bb_documents_payout_id_bb_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."bb_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bb_documents_member" ON "bb_documents" USING btree ("participant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "bb_payouts_week" ON "bb_payouts" USING btree ("participant_id","week") WHERE week is not null;