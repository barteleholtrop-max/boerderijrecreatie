ALTER TABLE "bank_split_transfers" DROP CONSTRAINT "bank_split_transfers_status";--> statement-breakpoint
ALTER TABLE "bank_splits" ADD COLUMN "draft_id" bigint;--> statement-breakpoint
ALTER TABLE "bank_split_transfers" ADD CONSTRAINT "bank_split_transfers_status" CHECK (status in ('nieuw','bezig','in-bunq','verstuurd','fout'));