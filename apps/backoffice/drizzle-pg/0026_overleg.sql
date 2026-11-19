CREATE TABLE "overleg_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text,
	"text" text NOT NULL,
	"owner_id" text,
	"owner_name" text DEFAULT '' NOT NULL,
	"due" text,
	"done" text,
	"done_by" text,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overleg_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "overleg_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"pot" text DEFAULT '' NOT NULL,
	"attendees" text DEFAULT '[]' NOT NULL,
	"agenda" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overleg_meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "overleg_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"pot" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT 'algemeen' NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"parent_id" text,
	"meeting_id" text,
	"status" text NOT NULL,
	"voters" text DEFAULT '[]' NOT NULL,
	"notify" text DEFAULT 'direct' NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL,
	"sent_at" text,
	"deadline" text,
	"reminded_at" text,
	"wanted_from" text,
	"valid_from" text,
	"decided_at" text,
	"decided_by" text,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "overleg_proposals_status_check" CHECK (status in ('concept','voorstel','aangehouden','vastgesteld','ingetrokken')),
	CONSTRAINT "overleg_proposals_topic" CHECK (topic in ('algemeen','verdeling')),
	CONSTRAINT "overleg_proposals_notify" CHECK (notify in ('direct','weekbericht'))
);
--> statement-breakpoint
ALTER TABLE "overleg_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "overleg_votes" (
	"proposal_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"vote" text NOT NULL,
	"reaction" text DEFAULT '' NOT NULL,
	"counter_id" text,
	"at" text NOT NULL,
	CONSTRAINT "overleg_votes_proposal_id_participant_id_pk" PRIMARY KEY("proposal_id","participant_id"),
	CONSTRAINT "overleg_votes_vote" CHECK (vote in ('akkoord','beter-voorstel'))
);
--> statement-breakpoint
ALTER TABLE "overleg_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "overleg_actions" ADD CONSTRAINT "overleg_actions_meeting_id_overleg_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."overleg_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overleg_actions" ADD CONSTRAINT "overleg_actions_owner_id_coop_participants_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overleg_proposals" ADD CONSTRAINT "overleg_proposals_meeting_id_overleg_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."overleg_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overleg_votes" ADD CONSTRAINT "overleg_votes_proposal_id_overleg_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."overleg_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overleg_votes" ADD CONSTRAINT "overleg_votes_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overleg_actions_open" ON "overleg_actions" USING btree ("done","due");--> statement-breakpoint
CREATE INDEX "overleg_meetings_date" ON "overleg_meetings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "overleg_proposals_status" ON "overleg_proposals" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "overleg_proposals_parent" ON "overleg_proposals" USING btree ("parent_id");