CREATE TABLE "bloei_proef" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" bigint NOT NULL,
	"data" text NOT NULL,
	CONSTRAINT "bloei_proef_fictief" CHECK (id='fictief-v1')
);
--> statement-breakpoint
ALTER TABLE "bloei_proef" ENABLE ROW LEVEL SECURITY;
