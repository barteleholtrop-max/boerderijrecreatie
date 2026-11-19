CREATE TABLE "bloei_market" (
	"id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"data_sealed" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bloei_market_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bloei_market" ENABLE ROW LEVEL SECURITY;