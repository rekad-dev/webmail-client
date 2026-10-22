CREATE TABLE IF NOT EXISTS app_oauth_sessions (
  session_hash char(64) PRIMARY KEY
    CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  subject text NOT NULL,
  encrypted_tokens text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS app_oauth_sessions_expires_at_idx
  ON app_oauth_sessions (expires_at);
