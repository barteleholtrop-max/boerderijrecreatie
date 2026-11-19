CREATE TABLE "harvest_debits" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"customer_id" text NOT NULL,
	"mandate_id" text,
	"sequence" text NOT NULL,
	"mode" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "harvest_debits" ADD CONSTRAINT "harvest_debits_subscription_id_harvest_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."harvest_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_debits" ADD CONSTRAINT "harvest_debits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harvest_debits_order" ON "harvest_debits" USING btree ("order_id");
--> statement-breakpoint
ALTER TABLE "harvest_debits" ENABLE ROW LEVEL SECURITY;
