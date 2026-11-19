-- Berichten van Meta in Gesprekken (akkoord eigenaar 9 november 2026): WhatsApp, Messenger en Instagram Direct, met beveiliging per rij.
CREATE TABLE "meta_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"from_us" bigint DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_sends" (
	"request_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"contact" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"customer_id" text DEFAULT '' NOT NULL,
	"last_message_id" text DEFAULT '' NOT NULL,
	"last_message_at" text DEFAULT '' NOT NULL,
	"last_customer_at" text DEFAULT '' NOT NULL,
	"last_from_us" bigint DEFAULT 0 NOT NULL,
	"unread" bigint DEFAULT 0 NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status_by" text DEFAULT '' NOT NULL,
	"status_at" text DEFAULT '' NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_messages" ADD CONSTRAINT "meta_messages_thread_id_meta_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."meta_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sends" ADD CONSTRAINT "meta_sends_thread_id_meta_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."meta_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_messages_thread_idx" ON "meta_messages" USING btree ("thread_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_one_pending_send" ON "meta_sends" USING btree ("thread_id") WHERE status IN ('verzenden','onzeker');--> statement-breakpoint
CREATE UNIQUE INDEX "meta_threads_contact_unique" ON "meta_threads" USING btree ("channel","contact");--> statement-breakpoint
CREATE INDEX "meta_threads_list_idx" ON "meta_threads" USING btree ("last_message_at");