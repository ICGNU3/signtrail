ALTER TABLE envelopes ADD COLUMN creator_email TEXT NOT NULL DEFAULT '';
ALTER TABLE envelopes ADD COLUMN creator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE envelopes ADD COLUMN expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE envelopes ADD COLUMN completion_claim TEXT;
ALTER TABLE envelopes ADD COLUMN completion_claimed_at TEXT;

CREATE INDEX IF NOT EXISTS envelopes_creator_created_idx ON envelopes(creator_email, created_at DESC);
CREATE INDEX IF NOT EXISTS envelopes_expires_at_idx ON envelopes(expires_at);

CREATE TABLE IF NOT EXISTS envelope_creation_quota (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  creator_email TEXT NOT NULL,
  window_name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS envelope_creation_quota_expiry_idx ON envelope_creation_quota(expires_at);
