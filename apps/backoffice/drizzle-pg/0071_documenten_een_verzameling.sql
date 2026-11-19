ALTER TABLE "coop_documents" DROP CONSTRAINT "coop_documents_category";--> statement-breakpoint
ALTER TABLE "coop_documents" ADD COLUMN "for_market" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_documents" ADD CONSTRAINT "coop_documents_category" CHECK (category in ('akte','reglement','kvk','afm','voorwaarden','overig'));