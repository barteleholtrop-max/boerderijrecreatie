CREATE TABLE "member_agreement_rule_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"data" text NOT NULL,
	"hash" text NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"proposals" text DEFAULT '{}' NOT NULL,
	"events" text DEFAULT '[]' NOT NULL,
	"created" text NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "member_agreement_rule_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "member_agreement_rule_versions_status" CHECK (status in ('concept','voorgesteld','geldig','vervangen','ingetrokken'))
);
--> statement-breakpoint
ALTER TABLE "member_agreement_rule_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "member_agreements_sequence";--> statement-breakpoint
ALTER TABLE "member_agreements" ADD COLUMN "contract_key" text DEFAULT 'lidmaatschap' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "member_agreements_sequence" ON "member_agreements" USING btree ("participant_id","contract_key","sequence");