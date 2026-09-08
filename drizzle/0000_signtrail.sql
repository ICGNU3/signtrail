CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY NOT NULL,
  recipient_token_hash TEXT NOT NULL UNIQUE,
  manage_token_hash TEXT NOT NULL UNIQUE,
  document_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'completed')),
  opened_at TEXT,
  last_opened_at TEXT,
  opened_count INTEGER NOT NULL DEFAULT 0,
  verified_opener_email TEXT,
  verified_opener_name TEXT,
  completed_by_email TEXT,
  completed_by_name TEXT,
  completed_at TEXT,
  source_key TEXT NOT NULL,
  signed_key TEXT,
  proof_key TEXT,
  fields_json TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  original_hash TEXT NOT NULL,
  signed_hash TEXT,
  verification_id TEXT
);

CREATE INDEX IF NOT EXISTS envelopes_recipient_hash_idx ON envelopes(recipient_token_hash);
CREATE INDEX IF NOT EXISTS envelopes_manage_hash_idx ON envelopes(manage_token_hash);
CREATE INDEX IF NOT EXISTS envelopes_created_at_idx ON envelopes(created_at DESC);
