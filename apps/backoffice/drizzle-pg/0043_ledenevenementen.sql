CREATE TABLE "member_event_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"coordinator_id" text DEFAULT '' NOT NULL,
	"farm_share_bp" bigint DEFAULT 2000 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "member_event_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "member_event_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_events" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"status" text DEFAULT 'aangevraagd' NOT NULL,
	"request" text NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"change" text DEFAULT '' NOT NULL,
	"event_id" text DEFAULT '' NOT NULL,
	"staffing" text DEFAULT '[]' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decided_by" text DEFAULT '' NOT NULL,
	"decided_at" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "member_events_status_check" CHECK (status in ('aangevraagd','voorstel','goedgekeurd','afgewezen','ingetrokken','geannuleerd'))
);
--> statement-breakpoint
ALTER TABLE "member_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_events" ADD CONSTRAINT "member_events_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_events_participant" ON "member_events" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "member_events_status" ON "member_events" USING btree ("status");