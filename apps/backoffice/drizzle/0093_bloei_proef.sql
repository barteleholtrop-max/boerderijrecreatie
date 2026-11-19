-- Issue #93: isolated fictitious ledger, never imported into customer/order balances.
CREATE TABLE bloei_proef (
 id TEXT PRIMARY KEY CHECK(id='fictief-v1'),
 revision INTEGER NOT NULL,
 data TEXT NOT NULL
);
