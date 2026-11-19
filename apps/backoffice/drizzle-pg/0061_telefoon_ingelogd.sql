CREATE TABLE "phone_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created" text NOT NULL,
	"last_seen" text,
	"revoked" text,
	"revoked_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phone_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_devices_hash" ON "phone_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "phone_devices_email_idx" ON "phone_devices" USING btree ("email");