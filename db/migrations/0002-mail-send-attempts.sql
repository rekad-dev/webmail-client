CREATE TABLE IF NOT EXISTS app_mail_send_attempts (
  session_hash char(64) NOT NULL
    CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  account_id text NOT NULL
    CHECK (length(account_id) BETWEEN 1 AND 512),
  attempt_key_hash char(64) NOT NULL
    CHECK (attempt_key_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL
    CHECK (state IN (
      'reserved',
      'draft_created',
      'submitting',
      'submitted',
      'submitted_sent_update_pending',
      'rejected',
      'unknown'
    )),
  email_id text,
  submission_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  PRIMARY KEY (session_hash, account_id, attempt_key_hash),
  CHECK (
    state IN ('reserved', 'rejected', 'unknown') OR email_id IS NOT NULL
  ),
  CHECK (
    submission_id IS NULL OR state IN ('submitted', 'submitted_sent_update_pending')
  ),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS app_mail_send_attempts_expires_at_idx
  ON app_mail_send_attempts (expires_at);
