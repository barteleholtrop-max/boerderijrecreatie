-- Additive only: central planning, inbox and shared concepts. No existing records are changed.
CREATE TABLE guest_workspace (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE guest_requests (id TEXT PRIMARY KEY, created TEXT NOT NULL);
CREATE TABLE guest_deliveries (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, mailbox TEXT NOT NULL, message_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, external_id TEXT, error TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
CREATE UNIQUE INDEX guest_one_pending_delivery ON guest_deliveries(thread_id) WHERE status IN ('verzenden','onzeker');
CREATE TABLE guest_locks (id TEXT PRIMARY KEY, token TEXT NOT NULL, until_ms INTEGER NOT NULL);
ALTER TABLE guest_deliveries ADD COLUMN draft_version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX guest_one_delivery_per_draft ON guest_deliveries(thread_id,draft_version);
ALTER TABLE guest_deliveries ADD COLUMN draft_id TEXT NOT NULL DEFAULT '';
ALTER TABLE guest_deliveries ADD COLUMN draft_hash TEXT NOT NULL DEFAULT '';
