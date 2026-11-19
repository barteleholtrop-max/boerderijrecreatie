CREATE TABLE "access_accounts" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'medewerker' NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"last_login" text,
	"auth_id" text,
	"modules" text DEFAULT '[]' NOT NULL,
	"quick_login" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"role" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'tekst' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"audio_key" text,
	"content" text DEFAULT '[]' NOT NULL,
	"sources" text DEFAULT '[]' NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"week" text NOT NULL,
	"account" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_settings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bunq_session" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"data_sealed" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "bunq_session_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "bunq_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connection_setting_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"account" text NOT NULL,
	"connection_id" text NOT NULL,
	"fields" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_settings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"secret" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "connection_settings_one" CHECK (id=1)
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"photo" text DEFAULT '' NOT NULL,
	"video" text DEFAULT '' NOT NULL,
	"sites" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"published_at" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"source" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drive_files" (
	"file_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"media_id" text,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"last_attempt" text,
	"last_ok" text,
	"last_error" text,
	"summary" text DEFAULT '{}' NOT NULL,
	"lock_token" text,
	"lock_until" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"people" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'aangemeld' NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT '' NOT NULL,
	"paid_at" text,
	"paid_by" text DEFAULT '' NOT NULL,
	"hold_until" text,
	"confirmation" text DEFAULT '' NOT NULL,
	"confirmation_message_id" text,
	"confirmation_error" text,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "event_signups_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "forecast_log" (
	"date" text PRIMARY KEY NOT NULL,
	"predicted" bigint NOT NULL,
	"temperature" double precision NOT NULL,
	"rain" double precision NOT NULL,
	"at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forecast_overrides" (
	"date" text PRIMARY KEY NOT NULL,
	"visitors" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forecast_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"auto" bigint DEFAULT 1 NOT NULL,
	"period_days" bigint DEFAULT 28 NOT NULL,
	"manual_pct" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"closed_years" text DEFAULT '[2026]' NOT NULL,
	CONSTRAINT "forecast_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "forecast_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gbp_link" (
	"id" text PRIMARY KEY NOT NULL,
	"account_email" text DEFAULT '' NOT NULL,
	"refresh_sealed" text,
	"account" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"location_title" text DEFAULT '' NOT NULL,
	"sync_hours" bigint DEFAULT 1 NOT NULL,
	"sync_events" bigint DEFAULT 1 NOT NULL,
	"hours_hash" text DEFAULT '' NOT NULL,
	"last_sync" text,
	"last_error" text,
	"connected_by" text DEFAULT '' NOT NULL,
	"connected_at" text,
	"lock_until" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_posts" (
	"event_id" text PRIMARY KEY NOT NULL,
	"post_name" text NOT NULL,
	"hash" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_bill_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"group_code_id" text NOT NULL,
	"position" bigint NOT NULL,
	"count" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"external_ref" text,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"paid_by" text DEFAULT '' NOT NULL,
	"paid_at" text DEFAULT '' NOT NULL,
	"payer_email" text DEFAULT '' NOT NULL,
	"payer_name" text DEFAULT '' NOT NULL,
	"paid_cents" bigint,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"budget_cents" bigint NOT NULL,
	"valid_from" text NOT NULL,
	"valid_until" text NOT NULL,
	"status" text DEFAULT 'actief' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"origin" text DEFAULT 'backoffice' NOT NULL,
	"holder_name" text DEFAULT '' NOT NULL,
	"holder_email" text DEFAULT '' NOT NULL,
	"holder_phone" text DEFAULT '' NOT NULL,
	"holder_token_hash" text DEFAULT '' NOT NULL,
	"invoice_number" bigint,
	"paid_at" text DEFAULT '' NOT NULL,
	"mail_paid" text DEFAULT '' NOT NULL,
	"mail_open" text DEFAULT '' NOT NULL,
	"mail_error" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'groep' NOT NULL,
	"warn_cents" bigint,
	CONSTRAINT "group_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "guest_advice" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_audit" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"by" text NOT NULL,
	"action" text NOT NULL,
	"reference" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_days" (
	"day" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"message_id" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"error" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"draft_version" bigint DEFAULT 0 NOT NULL,
	"draft_id" text DEFAULT '' NOT NULL,
	"draft_hash" text DEFAULT '' NOT NULL,
	CONSTRAINT "guest_deliveries_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "guest_events" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_kb" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"answer" text NOT NULL,
	"source" text DEFAULT 'handmatig' NOT NULL,
	"source_note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'voorstel' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"until_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_pickups" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_settings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"res_rev" bigint NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"data" text NOT NULL,
	CONSTRAINT "guest_settings_one" CHECK (id=1)
);
--> statement-breakpoint
CREATE TABLE "guest_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" bigint NOT NULL,
	"pos" bigint NOT NULL,
	"day" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_workspace" (
	"id" bigint PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"data" text NOT NULL,
	CONSTRAINT "guest_workspace_one" CHECK (id=1)
);
--> statement-breakpoint
CREATE TABLE "incoming_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"remaining" double precision NOT NULL,
	"due" text NOT NULL,
	"status" text NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"article" text DEFAULT '' NOT NULL,
	"stock" double precision DEFAULT 0 NOT NULL,
	"known" bigint DEFAULT 0 NOT NULL,
	"counted_at" text DEFAULT '' NOT NULL,
	"pack" double precision NOT NULL,
	"min" double precision DEFAULT 0 NOT NULL,
	"lead_days" double precision DEFAULT 0 NOT NULL,
	"shelf_days" double precision DEFAULT 0 NOT NULL,
	"allergens" text DEFAULT '[]' NOT NULL,
	"checked" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'inkoop' NOT NULL,
	"own_cents" double precision,
	"kind" text DEFAULT 'keuken' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"invoice_id" text NOT NULL,
	"id" text NOT NULL,
	"position" bigint NOT NULL,
	"article" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"net_cents" bigint NOT NULL,
	"ingredient_id" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"received" bigint DEFAULT 0 NOT NULL,
	"order_id" text,
	CONSTRAINT "invoice_lines_invoice_id_id_pk" PRIMARY KEY("invoice_id","id")
);
--> statement-breakpoint
CREATE TABLE "invoice_mails" (
	"mailbox" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"received" text NOT NULL,
	"attachments" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'nieuw' NOT NULL,
	"invoice_id" text,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "invoice_mails_mailbox_message_id_pk" PRIMARY KEY("mailbox","message_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"reviewed" bigint DEFAULT 0 NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_accounts" (
	"mailbox" text PRIMARY KEY NOT NULL,
	"refresh_token" text,
	"scopes" text DEFAULT '' NOT NULL,
	"label_name" text NOT NULL,
	"label_id" text,
	"history_id" text,
	"status" text DEFAULT 'niet-verbonden' NOT NULL,
	"last_sync_ok" text,
	"last_sync_attempt" text,
	"last_error" text,
	"connected_by" text DEFAULT '' NOT NULL,
	"connected_at" text,
	"lock_token" text,
	"lock_until" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_calendar_events" (
	"calendar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"ref" text NOT NULL,
	"hash" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "mail_calendar_events_calendar_id_event_id_pk" PRIMARY KEY("calendar_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "mail_calendars" (
	"mailbox" text NOT NULL,
	"calendar_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"last_sync_ok" text,
	"last_error" text,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "mail_calendars_mailbox_calendar_id_pk" PRIMARY KEY("mailbox","calendar_id")
);
--> statement-breakpoint
CREATE TABLE "mail_draft_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"mailbox" text NOT NULL,
	"thread_id" text NOT NULL,
	"draft_id" text,
	"created" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_drafts" (
	"mailbox" text NOT NULL,
	"draft_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"source" text DEFAULT 'gmail' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"seen" text DEFAULT '' NOT NULL,
	CONSTRAINT "mail_drafts_mailbox_draft_id_pk" PRIMARY KEY("mailbox","draft_id")
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"mailbox" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"internal_date" text NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"from_us" bigint DEFAULT 0 NOT NULL,
	"is_draft" bigint DEFAULT 0 NOT NULL,
	"unread" bigint DEFAULT 0 NOT NULL,
	"attachments" bigint DEFAULT 0 NOT NULL,
	"label_ids" text DEFAULT '[]' NOT NULL,
	CONSTRAINT "mail_messages_mailbox_message_id_pk" PRIMARY KEY("mailbox","message_id")
);
--> statement-breakpoint
CREATE TABLE "mail_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"expires" bigint NOT NULL,
	"purpose" text DEFAULT 'klantgesprekken' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_sends" (
	"request_id" text PRIMARY KEY NOT NULL,
	"mailbox" text NOT NULL,
	"thread_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"draft_message_id" text NOT NULL,
	"status" text NOT NULL,
	"sent_message_id" text,
	"error" text,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_thread_links" (
	"mailbox" text NOT NULL,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "mail_thread_links_mailbox_thread_id_kind_ref_pk" PRIMARY KEY("mailbox","thread_id","kind","ref")
);
--> statement-breakpoint
CREATE TABLE "mail_thread_state" (
	"mailbox" text NOT NULL,
	"thread_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned" text DEFAULT '' NOT NULL,
	"customer_id" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "mail_thread_state_mailbox_thread_id_pk" PRIMARY KEY("mailbox","thread_id")
);
--> statement-breakpoint
CREATE TABLE "mail_threads" (
	"mailbox" text NOT NULL,
	"thread_id" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"customer_email" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"last_message_at" text DEFAULT '' NOT NULL,
	"last_message_id" text DEFAULT '' NOT NULL,
	"last_from_us" bigint DEFAULT 0 NOT NULL,
	"last_customer_at" text DEFAULT '' NOT NULL,
	"unread" bigint DEFAULT 0 NOT NULL,
	"labeled" bigint DEFAULT 1 NOT NULL,
	"message_count" bigint DEFAULT 0 NOT NULL,
	"attachment_count" bigint DEFAULT 0 NOT NULL,
	"draft_count" bigint DEFAULT 0 NOT NULL,
	"automated" bigint DEFAULT 0 NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"synced" text DEFAULT '' NOT NULL,
	CONSTRAINT "mail_threads_mailbox_thread_id_pk" PRIMARY KEY("mailbox","thread_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"week_menu_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"media_id" text,
	"channels" text DEFAULT '[]' NOT NULL,
	"drafts" text DEFAULT '{}' NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"source_id" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	CONSTRAINT "media_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
CREATE TABLE "meta_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"from_us" bigint DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media" text DEFAULT '' NOT NULL,
	"at" text NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_sends" (
	"request_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"contact" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"customer_id" text DEFAULT '' NOT NULL,
	"last_message_id" text DEFAULT '' NOT NULL,
	"last_message_at" text DEFAULT '' NOT NULL,
	"last_customer_at" text DEFAULT '' NOT NULL,
	"last_from_us" bigint DEFAULT 0 NOT NULL,
	"unread" bigint DEFAULT 0 NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status_by" text DEFAULT '' NOT NULL,
	"status_at" text DEFAULT '' NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "operation_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"version" bigint,
	"action" text DEFAULT '' NOT NULL,
	"created" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_state" (
	"id" bigint PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"position" bigint NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"station" text NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"vat" text NOT NULL,
	"vat_cents" bigint NOT NULL,
	"paid_cents" bigint,
	"paid_vat_cents" bigint,
	"owner_id" text
);
--> statement-breakpoint
CREATE TABLE "order_price_settings" (
	"context" text PRIMARY KEY NOT NULL,
	"enabled" bigint DEFAULT 0 NOT NULL,
	"max_percent" bigint DEFAULT 300 NOT NULL,
	"allow_zero" bigint DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"request" text NOT NULL,
	"data" text NOT NULL,
	"created" text NOT NULL,
	"mode" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'vastgelegd' NOT NULL,
	"payment_status" text DEFAULT 'niet-gekoppeld' NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"vat9_cents" bigint DEFAULT 0 NOT NULL,
	"vat21_cents" bigint DEFAULT 0 NOT NULL,
	"test" bigint DEFAULT 0 NOT NULL,
	"sales_context" text DEFAULT '' NOT NULL,
	"commercial_cents" bigint,
	"chosen_cents" bigint,
	"difference_cents" bigint DEFAULT 0 NOT NULL,
	"chosen_vat9_cents" bigint,
	"chosen_vat21_cents" bigint,
	"group_code_id" text,
	CONSTRAINT "orders_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'wachtend' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"run_after" text NOT NULL,
	"locked_until" text,
	"last_error" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "outbox_jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"method" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"external_ref" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "payments_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
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
CREATE TABLE "privacy_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "privacy_policy_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "privacy_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"draft" text NOT NULL,
	"published" text,
	"version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"thread_id" text,
	"created_by" text NOT NULL,
	"created" text NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"decision_note" text DEFAULT '' NOT NULL,
	"decision_request_id" text,
	CONSTRAINT "proposals_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "proposals_decision_request_id_unique" UNIQUE("decision_request_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created" text NOT NULL,
	"expires" text NOT NULL,
	"sent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"date" text NOT NULL,
	"portion_cents" bigint,
	"recipe" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"product_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"position" bigint NOT NULL,
	"quantity" double precision NOT NULL,
	CONSTRAINT "recipe_lines_product_id_ingredient_id_pk" PRIMARY KEY("product_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"product_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"yield" double precision NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"loss_pct" double precision DEFAULT 0 NOT NULL,
	"packaging_cents" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"reviewed" bigint DEFAULT 0 NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "service_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" bigint NOT NULL,
	"active" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "service_tables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sheet_config" (
	"id" bigint PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"lock_token" text,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	"last_sync" text,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "sheet_links" (
	"source_id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"revision" text NOT NULL,
	"baseline" text NOT NULL,
	CONSTRAINT "sheet_links_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" text PRIMARY KEY NOT NULL,
	"week" text NOT NULL,
	"name" text NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"checked" bigint DEFAULT 0 NOT NULL,
	"checked_by" text DEFAULT '' NOT NULL,
	"checked_at" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created" text NOT NULL,
	"removed" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "signup_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"signup_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text NOT NULL,
	"external_ref" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL,
	CONSTRAINT "signup_payments_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "staff_push" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created" text NOT NULL,
	"last_sent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "station_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "station_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"date" text NOT NULL,
	"reason" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"uitstraling" text DEFAULT 'klassiek' NOT NULL,
	"onderdelen" text DEFAULT '{}' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "website_settings_main" CHECK (id='main')
);
--> statement-breakpoint
ALTER TABLE "website_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "week_menu_items" (
	"menu_id" text NOT NULL,
	"position" bigint NOT NULL,
	"product_id" text NOT NULL,
	"day" text DEFAULT '' NOT NULL,
	"portions" double precision,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "week_menu_items_menu_id_position_pk" PRIMARY KEY("menu_id","position")
);
--> statement-breakpoint
CREATE TABLE "week_menus" (
	"id" text PRIMARY KEY NOT NULL,
	"week" text NOT NULL,
	"status" text DEFAULT 'concept' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"thread_id" text,
	"confirmed_by" text,
	"confirmed_at" text,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_status" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"version" bigint NOT NULL,
	"updated" text NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."assistant_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_bill_shares" ADD CONSTRAINT "group_bill_shares_group_code_id_group_codes_id_fk" FOREIGN KEY ("group_code_id") REFERENCES "public"."group_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_messages" ADD CONSTRAINT "meta_messages_thread_id_meta_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."meta_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sends" ADD CONSTRAINT "meta_sends_thread_id_meta_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."meta_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_recipes_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."recipes"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_payments" ADD CONSTRAINT "signup_payments_signup_id_event_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."event_signups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_menu_items" ADD CONSTRAINT "week_menu_items_menu_id_week_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."week_menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workplace_pairings" ADD CONSTRAINT "workplace_pairings_device_id_workplace_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."workplace_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_messages_thread_seq" ON "assistant_messages" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE INDEX "assistant_messages_created" ON "assistant_messages" USING btree ("created");--> statement-breakpoint
CREATE INDEX "assistant_threads_week" ON "assistant_threads" USING btree ("domain","week");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_slug_unique" ON "content_items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_source_unique" ON "content_items" USING btree ("source") WHERE source <> '';--> statement-breakpoint
CREATE INDEX "event_signups_event_idx" ON "event_signups" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "group_bill_shares_provider_external_ref_unique" ON "group_bill_shares" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "group_bill_shares_group_idx" ON "group_bill_shares" USING btree ("group_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_codes_invoice_number_unique" ON "group_codes" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "guest_appointments_day_idx" ON "guest_appointments" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_one_pending_delivery" ON "guest_deliveries" USING btree ("thread_id") WHERE status IN ('verzenden','onzeker');--> statement-breakpoint
CREATE UNIQUE INDEX "guest_one_delivery_per_draft" ON "guest_deliveries" USING btree ("thread_id","draft_version");--> statement-breakpoint
CREATE INDEX "guest_events_day_idx" ON "guest_events" USING btree ("day");--> statement-breakpoint
CREATE INDEX "guest_kb_status_idx" ON "guest_kb" USING btree ("status");--> statement-breakpoint
CREATE INDEX "guest_pickups_day_idx" ON "guest_pickups" USING btree ("day");--> statement-breakpoint
CREATE INDEX "guest_reservations_day_idx" ON "guest_reservations" USING btree ("day");--> statement-breakpoint
CREATE INDEX "invoice_lines_ingredient_idx" ON "invoice_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "invoice_mails_status_idx" ON "invoice_mails" USING btree ("mailbox","status","received");--> statement-breakpoint
CREATE INDEX "invoices_date_idx" ON "invoices" USING btree ("date");--> statement-breakpoint
CREATE INDEX "mail_drafts_thread_idx" ON "mail_drafts" USING btree ("mailbox","thread_id");--> statement-breakpoint
CREATE INDEX "mail_messages_thread_idx" ON "mail_messages" USING btree ("mailbox","thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_sends_active_draft" ON "mail_sends" USING btree ("mailbox","draft_id") WHERE status IN ('bezig','verzonden','onzeker');--> statement-breakpoint
CREATE INDEX "mail_sends_thread_idx" ON "mail_sends" USING btree ("mailbox","thread_id");--> statement-breakpoint
CREATE INDEX "mail_threads_list_idx" ON "mail_threads" USING btree ("mailbox","labeled","last_message_at");--> statement-breakpoint
CREATE INDEX "marketing_tasks_status" ON "marketing_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meta_messages_thread_idx" ON "meta_messages" USING btree ("thread_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_one_pending_send" ON "meta_sends" USING btree ("thread_id") WHERE status IN ('verzenden','onzeker');--> statement-breakpoint
CREATE UNIQUE INDEX "meta_threads_contact_unique" ON "meta_threads" USING btree ("channel","contact");--> statement-breakpoint
CREATE INDEX "meta_threads_list_idx" ON "meta_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_requests_version_unique" ON "operation_requests" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_position_unique" ON "order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "order_lines_station_order_idx" ON "order_lines" USING btree ("station","order_id");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created");--> statement-breakpoint
CREATE INDEX "orders_group_code_idx" ON "orders" USING btree ("group_code_id");--> statement-breakpoint
CREATE INDEX "outbox_jobs_due" ON "outbox_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_external_ref_unique" ON "payments" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_devices_hash" ON "phone_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "phone_devices_email_idx" ON "phone_devices" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_one_bon" ON "print_jobs" USING btree ("printer_id","order_id") WHERE kind='bon';--> statement-breakpoint
CREATE INDEX "print_jobs_queue_idx" ON "print_jobs" USING btree ("printer_id","status","id");--> statement-breakpoint
CREATE INDEX "proposals_status" ON "proposals" USING btree ("status","created");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_order_endpoint_unique" ON "push_subscriptions" USING btree ("order_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_expires_idx" ON "push_subscriptions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "recipe_history_product_idx" ON "recipe_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "security_audit_at" ON "security_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "shopping_items_week_idx" ON "shopping_items" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "signup_payments_provider_external_ref_unique" ON "signup_payments" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "signup_payments_signup_idx" ON "signup_payments" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_push_account_endpoint_unique" ON "staff_push" USING btree ("account","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_moves_seq_unique" ON "stock_moves" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "stock_moves_ingredient_idx" ON "stock_moves" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "stock_moves_reason_idx" ON "stock_moves" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "week_menus_week" ON "week_menus" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "week_menus_one_confirmed" ON "week_menus" USING btree ("week") WHERE status = 'bevestigd';--> statement-breakpoint
CREATE UNIQUE INDEX "workplace_devices_hash" ON "workplace_devices" USING btree ("token_hash");