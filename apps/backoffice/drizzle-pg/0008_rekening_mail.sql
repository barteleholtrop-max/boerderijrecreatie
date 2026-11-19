-- Factuurmail van een gezamenlijke rekening (wens eigenaar 5 november 2026): verstuurd vanaf de mailbox van Gesprekken (rianne@).
ALTER TABLE "group_codes" ADD COLUMN "mail_paid" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "mail_open" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_codes" ADD COLUMN "mail_error" text DEFAULT '' NOT NULL;