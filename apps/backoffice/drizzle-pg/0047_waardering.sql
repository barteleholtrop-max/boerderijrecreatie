CREATE TABLE "bloei_waardering" (
	"id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"data" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bloei_waardering_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bloei_waardering" ENABLE ROW LEVEL SECURITY;