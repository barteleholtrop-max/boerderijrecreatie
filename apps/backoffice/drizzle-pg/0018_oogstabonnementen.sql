CREATE TABLE "harvest_billing" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"mandate_id" text,
	"mode" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'eerste-betaling' NOT NULL,
	"next_start" text,
	"pending_order_id" bigint,
	"problem" text DEFAULT '' NOT NULL,
	"consent_at" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_collections" (
	"period_id" text NOT NULL,
	"date" text NOT NULL,
	"collected" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "harvest_collections_period_id_date_pk" PRIMARY KEY("period_id","date")
);
--> statement-breakpoint
CREATE TABLE "harvest_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"start" text NOT NULL,
	"order_id" bigint NOT NULL,
	"data" text NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"request" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"selection" text NOT NULL,
	"agreement" text NOT NULL,
	"status" text DEFAULT 'actief' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "harvest_subscriptions_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "harvest_billing" ADD CONSTRAINT "harvest_billing_subscription_id_harvest_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."harvest_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_billing" ADD CONSTRAINT "harvest_billing_pending_order_id_orders_id_fk" FOREIGN KEY ("pending_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_collections" ADD CONSTRAINT "harvest_collections_period_id_harvest_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."harvest_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_periods" ADD CONSTRAINT "harvest_periods_subscription_id_harvest_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."harvest_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_periods" ADD CONSTRAINT "harvest_periods_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harvest_billing_due" ON "harvest_billing" USING btree ("status","next_start");--> statement-breakpoint
CREATE UNIQUE INDEX "harvest_periods_once" ON "harvest_periods" USING btree ("subscription_id","start");--> statement-breakpoint
CREATE INDEX "harvest_subscriptions_status" ON "harvest_subscriptions" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "harvest_settings" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "harvest_subscriptions" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "harvest_periods" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "harvest_collections" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "harvest_billing" ENABLE ROW LEVEL SECURITY;
