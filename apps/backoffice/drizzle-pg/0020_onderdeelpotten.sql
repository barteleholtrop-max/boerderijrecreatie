CREATE TABLE "unit_fund_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"paid_by" text DEFAULT 'cooperatie' NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"voided" text,
	CONSTRAINT "unit_fund_entries_kind" CHECK (kind in ('uitgave','correctie-plus','correctie-min')),
	CONSTRAINT "unit_fund_entries_amount" CHECK (amount_cents>0)
);
--> statement-breakpoint
ALTER TABLE "unit_fund_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_fund_products" (
	"product_id" text PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"since" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_fund_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_funds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manager_id" text,
	"share_bp" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_funds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "unit_fund_entries" ADD CONSTRAINT "unit_fund_entries_fund_id_unit_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."unit_funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_fund_products" ADD CONSTRAINT "unit_fund_products_fund_id_unit_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."unit_funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_funds" ADD CONSTRAINT "unit_funds_manager_id_coop_participants_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unit_fund_entries_fund" ON "unit_fund_entries" USING btree ("fund_id","day");--> statement-breakpoint
CREATE INDEX "unit_fund_products_fund" ON "unit_fund_products" USING btree ("fund_id");