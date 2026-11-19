-- Connection credentials are encrypted as one authenticated AES-GCM payload.
CREATE TABLE connection_settings(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,secret TEXT NOT NULL,updated TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE connection_setting_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,account TEXT NOT NULL,connection_id TEXT NOT NULL,fields TEXT NOT NULL);
