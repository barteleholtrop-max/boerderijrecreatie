CREATE TABLE "coop_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"for_members" bigint DEFAULT 0 NOT NULL,
	"file_name" text NOT NULL,
	"size" bigint NOT NULL,
	"blob_key" text NOT NULL,
	"uploaded" text NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "coop_documents_category" CHECK (category in ('akte','reglement','kvk','voorwaarden','overig'))
);
--> statement-breakpoint
ALTER TABLE "coop_documents" ENABLE ROW LEVEL SECURITY;