CREATE TABLE IF NOT EXISTS app_profile_pictures (
  subject text PRIMARY KEY CHECK (char_length(subject) BETWEEN 1 AND 512),
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 262144),
  updated_at timestamptz NOT NULL DEFAULT now()
);
