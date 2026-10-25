CREATE TABLE IF NOT EXISTS app_managed_mail_banners (
  id smallint PRIMARY KEY CHECK (id = 1),
  header_html text NOT NULL DEFAULT '',
  footer_html text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(header_html) <= 32768),
  CHECK (octet_length(footer_html) <= 32768)
);

INSERT INTO app_managed_mail_banners (id, header_html, footer_html, version)
VALUES (1, '', '', 0)
ON CONFLICT (id) DO NOTHING;
