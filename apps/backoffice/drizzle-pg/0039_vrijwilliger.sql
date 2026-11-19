ALTER TABLE "coop_participants" ADD COLUMN "volunteer" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "volunteer_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "volunteer_basis" text DEFAULT 'maand' NOT NULL;