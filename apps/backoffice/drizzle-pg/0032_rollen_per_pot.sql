CREATE TABLE "pot_roles" (
	"pot" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'dag' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "pot_roles_pot_id_pk" PRIMARY KEY("pot","id"),
	CONSTRAINT "pot_roles_kind" CHECK (kind in ('dag','week'))
);
--> statement-breakpoint
ALTER TABLE "pot_roles" ENABLE ROW LEVEL SECURITY;