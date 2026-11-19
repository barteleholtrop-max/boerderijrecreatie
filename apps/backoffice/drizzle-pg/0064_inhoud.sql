CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"photo" text DEFAULT '' NOT NULL,
	"video" text DEFAULT '' NOT NULL,
	"sites" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"published_at" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_slug_unique" ON "content_items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("status","published_at");