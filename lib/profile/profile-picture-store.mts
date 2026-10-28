import "server-only";

import postgres from "postgres";

import type { ProfilePictureType } from "./profile-picture-image.mts";

export interface StoredProfilePicture {
  type: ProfilePictureType;
  bytes: Uint8Array;
  updatedAt: Date;
}

interface PictureRow {
  content_type: ProfilePictureType;
  image: Uint8Array;
  updated_at: Date | string;
}

type SqlClient = ReturnType<typeof postgres>;

const runtimeGlobal = globalThis as typeof globalThis & {
  __rekadProfilePictureSql?: SqlClient;
};

function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("A PostgreSQL DATABASE_URL is required for profile pictures.");
  }
  runtimeGlobal.__rekadProfilePictureSql ??= postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });
  return runtimeGlobal.__rekadProfilePictureSql;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function getProfilePicture(subject: string): Promise<StoredProfilePicture | null> {
  const rows = await getSql()<PictureRow[]>`
    SELECT content_type, image, updated_at
    FROM app_profile_pictures
    WHERE subject = ${subject}
  `;
  const row = rows[0];
  return row
    ? { type: row.content_type, bytes: new Uint8Array(row.image), updatedAt: toDate(row.updated_at) }
    : null;
}

/** Version used to refresh the image URL, or null when the person has no picture. */
export async function getProfilePictureVersion(subject: string): Promise<number | null> {
  const rows = await getSql()<Array<{ updated_at: Date | string }>>`
    SELECT updated_at FROM app_profile_pictures WHERE subject = ${subject}
  `;
  return rows[0] ? toDate(rows[0].updated_at).getTime() : null;
}

export async function saveProfilePicture(
  subject: string,
  type: ProfilePictureType,
  bytes: Uint8Array,
): Promise<number> {
  const rows = await getSql()<Array<{ updated_at: Date | string }>>`
    INSERT INTO app_profile_pictures (subject, content_type, image)
    VALUES (${subject}, ${type}, ${Buffer.from(bytes)})
    ON CONFLICT (subject) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      image = EXCLUDED.image,
      updated_at = now()
    RETURNING updated_at
  `;
  return toDate(rows[0].updated_at).getTime();
}

export async function deleteProfilePicture(subject: string): Promise<void> {
  await getSql()`DELETE FROM app_profile_pictures WHERE subject = ${subject}`;
}
