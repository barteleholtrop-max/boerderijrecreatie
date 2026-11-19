CREATE TABLE "bloei_administration" (
	"id" text PRIMARY KEY NOT NULL,
	"digest" text NOT NULL,
	"data_sealed" text NOT NULL,
	"sources_sealed" text NOT NULL,
	"imported_at" text NOT NULL,
	"imported_by" text NOT NULL,
	CONSTRAINT "bloei_administration_digest_unique" UNIQUE("digest"),
	CONSTRAINT "bloei_administration_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bloei_administration" ENABLE ROW LEVEL SECURITY;