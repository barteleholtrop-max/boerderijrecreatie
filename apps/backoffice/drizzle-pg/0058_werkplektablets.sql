CREATE TABLE "workplace_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"last_seen" text,
	"revoked" text,
	"revoked_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workplace_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workplace_pairings" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"expires" text NOT NULL,
	"used_at" text,
	"device_id" text
);
--> statement-breakpoint
ALTER TABLE "workplace_pairings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workplace_pairings" ADD CONSTRAINT "workplace_pairings_device_id_workplace_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."workplace_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workplace_devices_hash" ON "workplace_devices" USING btree ("token_hash");