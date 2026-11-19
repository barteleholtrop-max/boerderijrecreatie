-- Zelf toegevoegde boodschappen bij de Weekassistent (wens eigenaar 9 november 2026), met beveiliging per rij.
CREATE TABLE "shopping_items" (
	"id" text PRIMARY KEY NOT NULL,
	"week" text NOT NULL,
	"name" text NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"checked" bigint DEFAULT 0 NOT NULL,
	"checked_by" text DEFAULT '' NOT NULL,
	"checked_at" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"removed" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "shopping_items_week_idx" ON "shopping_items" USING btree ("week");