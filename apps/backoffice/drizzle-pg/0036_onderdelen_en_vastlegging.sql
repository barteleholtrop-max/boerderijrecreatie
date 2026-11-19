CREATE TABLE "security_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"account" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"path" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_accounts" ADD COLUMN "modules" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "security_audit_at" ON "security_audit" USING btree ("at");