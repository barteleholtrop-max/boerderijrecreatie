-- Ledenkaart (besluit eigenaar 5 november 2026): soort lid, lid sinds, stemrecht, contact en onderdelen op de werkende leden.
-- Alleen nieuwe kolommen met een standaardwaarde; bestaande gegevens blijven ongewijzigd. Gaat later over naar Bloei.
ALTER TABLE "coop_participants" ADD COLUMN "member_class" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "member_since" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "voting" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "units" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "coop_participants" ADD COLUMN "bloei_member_id" text DEFAULT '' NOT NULL;