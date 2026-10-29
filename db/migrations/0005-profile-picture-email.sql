-- The address a picture belongs to, so signed-in colleagues can see it next to
-- that person's messages. Additive: existing rows keep working and get their
-- address filled in the next time their owner opens the app.
ALTER TABLE app_profile_pictures
  ADD COLUMN IF NOT EXISTS email text
    CHECK (email IS NULL OR (email = lower(email) AND char_length(email) BETWEEN 3 AND 320));

CREATE INDEX IF NOT EXISTS app_profile_pictures_email_idx
  ON app_profile_pictures (email)
  WHERE email IS NOT NULL;
