-- Beginwaarden die de backoffice verwacht. Bestaan ze al, dan blijven ze staan.
INSERT INTO "availability_settings" ("id","data","version","updated") VALUES (1,'{"openingHours":[null,null,null,null,null,null,null],"closedDays":[],"yte":{"weekdays":[],"times":[],"capacityGuests":null,"weeksAhead":8,"closedDates":[]}}',1,'2026-11-19T00:00:00.000Z') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "guest_settings" ("id","rev","res_rev","data") VALUES (1,0,0,'{}') ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Afscherming voor Supabase: Supabase stelt tabellen in het schema public automatisch open via de Data API (met de
-- openbare sleutel). De backoffice gebruikt die API niet; hij verbindt rechtstreeks met de database en heeft daar alle
-- rechten. Daarom staat beveiliging per rij (Row Level Security) aan op alle tabellen, zonder regels: via de Data API is
-- dan niets te lezen of te wijzigen. Elke nieuwe tabel krijgt dit in zijn eigen migratie.
ALTER TABLE "access_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "availability_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bunq_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connection_setting_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connection_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_sync" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gbp_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gbp_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_bill_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_advice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_kb" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_knowledge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_pickups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incoming_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_mails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_draft_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_oauth_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_thread_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_thread_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marketing_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "operation_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "operations_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_price_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "phone_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "printers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "privacy_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sheet_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sheet_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shopping_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signup_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_push" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "station_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "website_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "week_menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "week_menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workplace_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workplace_pairings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
 END LOOP;
END $$;
