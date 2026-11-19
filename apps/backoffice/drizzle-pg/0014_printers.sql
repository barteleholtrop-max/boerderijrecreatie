-- Systeem → Printers (wens eigenaar 5 november 2026) en de printwachtrij voor Epson Server Direct Print (akkoord eigenaar
-- 5 november 2026): de printer haalt zelf elke 5 seconden zijn bonnen op. Beginwaarden: de twee printers uit het planbord.
CREATE TABLE "print_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"printer_id" text NOT NULL,
	"order_id" bigint,
	"kind" text NOT NULL,
	"status" text DEFAULT 'wachtrij' NOT NULL,
	"xml" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"created" text NOT NULL,
	"sent_at" text,
	"done_at" text,
	"last_error" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"station" text NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"port" bigint DEFAULT 9100 NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"paper" bigint DEFAULT 80 NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"secret_hash" text DEFAULT '' NOT NULL,
	"print_from" text DEFAULT '' NOT NULL,
	"last_seen" text DEFAULT '' NOT NULL,
	CONSTRAINT "printers_port" CHECK ("printers"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "printers_paper" CHECK ("printers"."paper" IN (58,80))
);
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_one_bon" ON "print_jobs" USING btree ("printer_id","order_id") WHERE kind='bon';--> statement-breakpoint
CREATE INDEX "print_jobs_queue_idx" ON "print_jobs" USING btree ("printer_id","status","id");--> statement-breakpoint
-- Afscherming voor Supabase: niet via de Data API bereikbaar; alleen de backoffice zelf leest en schrijft.
ALTER TABLE "printers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "printers" ("id","name","station","host","port","model","paper","active","note","version","updated","updated_by") VALUES
 ('printer-kok','Printer kok','kok','192.168.192.168',9100,'Epson TM-m30III',80,1,'Uit het planbord (afgesproken). Model bevestigd door de eigenaar op 5 november 2026. IP-adres controleren op de zelftestbon.',1,'2026-11-05T00:00:00.000Z','planbord'),
 ('printer-barista','Printer barista','barista','192.168.68.129',9100,'Epson TM-m30III',80,1,'IP-adres doorgegeven door de eigenaar op 5 november 2026 (subnet 255.255.255.0, gateway 192.168.68.1). Model bevestigd door de eigenaar op 5 november 2026.',1,'2026-11-05T00:00:00.000Z','planbord')
ON CONFLICT ("id") DO NOTHING;
