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

/** The stored address and version of a person's picture, or null when they have none. */
export async function getProfilePictureEntry(
  subject: string,
): Promise<{ email: string | null; version: number } | null> {
  const rows = await getSql()<Array<{ email: string | null; updated_at: Date | string }>>`
    SELECT email, updated_at FROM app_profile_pictures WHERE subject = ${subject}
  `;
  return rows[0] ? { email: rows[0].email, version: toDate(rows[0].updated_at).getTime() } : null;
}

/** Picture for the person who owns this address. Several people never share one. */
export async function getProfilePictureByEmail(email: string): Promise<StoredProfilePicture | null> {
  const rows = await getSql()<PictureRow[]>`
    SELECT content_type, image, updated_at
    FROM app_profile_pictures
    WHERE email = ${email}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? { type: row.content_type, bytes: new Uint8Array(row.image), updatedAt: toDate(row.updated_at) }
    : null;
}

/** Versions only, never image bytes, for the addresses that have a picture. */
export async function getProfilePictureVersionsByEmail(emails: string[]): Promise<Record<string, number>> {
  if (emails.length === 0) return {};
  const rows = await getSql()<Array<{ email: string; updated_at: Date | string }>>`
    SELECT DISTINCT ON (email) email, updated_at
    FROM app_profile_pictures
    WHERE email IN ${getSql()(emails)}
    ORDER BY email, updated_at DESC
  `;
  return Object.fromEntries(rows.map((row) => [row.email, toDate(row.updated_at).getTime()]));
}

export async function saveProfilePicture(
  subject: string,
  type: ProfilePictureType,
  bytes: Uint8Array,
  email: string | null,
): Promise<number> {
  const rows = await getSql()<Array<{ updated_at: Date | string }>>`
    INSERT INTO app_profile_pictures (subject, content_type, image, email)
    VALUES (${subject}, ${type}, ${Buffer.from(bytes)}, ${email})
    ON CONFLICT (subject) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      image = EXCLUDED.image,
      email = COALESCE(EXCLUDED.email, app_profile_pictures.email),
      updated_at = now()
    RETURNING updated_at
  `;
  return toDate(rows[0].updated_at).getTime();
}

/** Fills in or corrects the address of an existing picture without touching its version. */
export async function syncProfilePictureEmail(subject: string, email: string): Promise<void> {
  await getSql()`
    UPDATE app_profile_pictures SET email = ${email}
    WHERE subject = ${subject} AND email IS DISTINCT FROM ${email}
  `;
}

export async function deleteProfilePicture(subject: string): Promise<void> {
  await getSql()`DELETE FROM app_profile_pictures WHERE subject = ${subject}`;
}
