CREATE TABLE "bloei_income_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"first_month" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'aangevraagd' NOT NULL,
	"requested_at" text NOT NULL,
	"consent_at" text NOT NULL,
	"decided_at" text,
	"decided_by" text,
	"note" text DEFAULT '' NOT NULL,
	"exit_plan" text DEFAULT '' NOT NULL,
	"events" text DEFAULT '[]' NOT NULL,
	CONSTRAINT "bloei_income_loans_amount" CHECK (amount_cents>0),
	CONSTRAINT "bloei_income_loans_status" CHECK (status in ('aangevraagd','goedgekeurd','afgewezen','afgelost'))
);
--> statement-breakpoint
ALTER TABLE "bloei_income_loans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bloei_loan_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" text NOT NULL,
	"month" text NOT NULL,
	"bb_entry_id" text,
	"external_ref" text,
	"at" text NOT NULL,
	"by" text NOT NULL,
	CONSTRAINT "bloei_loan_repayments_bb_entry_id_unique" UNIQUE("bb_entry_id"),
	CONSTRAINT "bloei_loan_repayments_external_ref_unique" UNIQUE("external_ref"),
	CONSTRAINT "bloei_loan_repayments_amount" CHECK (amount_cents>0),
	CONSTRAINT "bloei_loan_repayments_method" CHECK (method in ('bb','bank'))
);
--> statement-breakpoint
ALTER TABLE "bloei_loan_repayments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_agreement_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"data" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "member_agreement_rules_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "member_agreement_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"data" text NOT NULL,
	"hash" text NOT NULL,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"proposals" text DEFAULT '{}' NOT NULL,
	"accepted_at" text,
	"accepted_hash" text,
	"valid_from" text,
	"valid_until" text,
	"events" text DEFAULT '[]' NOT NULL,
	"created" text NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "member_agreements_status" CHECK (status in ('concept','voorgesteld','geldig','vervangen','ingetrokken'))
);
--> statement-breakpoint
ALTER TABLE "member_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_shop_shifts" (
	"day" text NOT NULL,
	"part" text NOT NULL,
	"participant_id" text NOT NULL,
	"offered" text DEFAULT '' NOT NULL,
	"cancelled" text DEFAULT '' NOT NULL,
	"events" text DEFAULT '[]' NOT NULL,
	"at" text NOT NULL,
	"by" text NOT NULL,
	CONSTRAINT "member_shop_shifts_day_part_pk" PRIMARY KEY("day","part"),
	CONSTRAINT "member_shop_shifts_part" CHECK (part in ('ochtend','middag'))
);
--> statement-breakpoint
ALTER TABLE "member_shop_shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bb_entries" DROP CONSTRAINT "bb_entries_kind";--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "member_login_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bloei_income_loans" ADD CONSTRAINT "bloei_income_loans_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloei_loan_repayments" ADD CONSTRAINT "bloei_loan_repayments_loan_id_bloei_income_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."bloei_income_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloei_loan_repayments" ADD CONSTRAINT "bloei_loan_repayments_bb_entry_id_bb_entries_id_fk" FOREIGN KEY ("bb_entry_id") REFERENCES "public"."bb_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_agreements" ADD CONSTRAINT "member_agreements_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_shop_shifts" ADD CONSTRAINT "member_shop_shifts_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloei_income_loans_member" ON "bloei_income_loans" USING btree ("participant_id","status");--> statement-breakpoint
CREATE INDEX "bloei_loan_repayments_loan" ON "bloei_loan_repayments" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_agreements_sequence" ON "member_agreements" USING btree ("participant_id","sequence");--> statement-breakpoint
CREATE INDEX "member_agreements_member" ON "member_agreements" USING btree ("participant_id","status");--> statement-breakpoint
CREATE INDEX "member_shop_shifts_member" ON "member_shop_shifts" USING btree ("participant_id","day");--> statement-breakpoint
ALTER TABLE "bb_entries" ADD CONSTRAINT "bb_entries_kind" CHECK (kind in ('pot-week','winkel-week','correctie','opname','besteding','ruil','inkomenslening','aflossing'));