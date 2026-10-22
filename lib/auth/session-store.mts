import "server-only";

import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

import {
  decryptOAuthTokens,
  encryptOAuthTokens,
  type StoredOAuthTokens,
} from "./token-crypto.mts";
import { encodeOAuthClientBasicCredentials } from "./oauth-client-auth.mts";

const APP_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 45_000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ISSUER = "https://mail.rekad.id";
const DEFAULT_CLIENT_ID = "webmail";

type SqlClient = ReturnType<typeof postgres>;

interface SessionRow {
  session_hash: string;
  subject: string;
  encrypted_tokens: string;
  expires_at: Date | string;
}

interface RefreshedTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface OAuthSessionHandle {
  sessionId: string;
  expiresAt: Date;
}

export interface AuthenticatedOAuthSession {
  subject: string;
  accountId: string;
  accessToken: string;
  expiresAt: Date;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __rekadAuthSql?: SqlClient;
};

function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("A PostgreSQL DATABASE_URL is required for authentication.");
  }

  runtimeGlobal.__rekadAuthSql ??= postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });
  return runtimeGlobal.__rekadAuthSql;
}

function hashSessionId(sessionId: string): string {
  if (
    typeof sessionId !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(sessionId) ||
    Buffer.from(sessionId, "base64url").length !== 32
  ) {
    throw new Error("The application session is invalid.");
  }
  return createHash("sha256").update(sessionId).digest("hex");
}

function dateFromDatabase(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The stored authentication session is invalid.");
  }
  return date;
}

function getTokenEndpoint(): URL {
  const issuerValue = process.env.AUTH_STALWART_ISSUER ?? DEFAULT_ISSUER;
  let issuer: URL;
  let tokenEndpoint: URL;

  try {
    issuer = new URL(issuerValue);
    tokenEndpoint = new URL(
      process.env.AUTH_STALWART_TOKEN_ENDPOINT ?? "/auth/token",
      issuer,
    );
  } catch {
    throw new Error("The Stalwart OAuth endpoint configuration is invalid.");
  }

  if (
    issuer.protocol !== "https:" ||
    issuer.hostname !== "mail.rekad.id" ||
    issuer.pathname !== "/" ||
    issuer.search ||
    issuer.hash ||
    issuer.username ||
    issuer.password ||
    tokenEndpoint.protocol !== "https:" ||
    tokenEndpoint.origin !== issuer.origin ||
    tokenEndpoint.pathname !== "/auth/token" ||
    tokenEndpoint.search ||
    tokenEndpoint.username ||
    tokenEndpoint.password ||
    tokenEndpoint.hash
  ) {
    throw new Error("The Stalwart OAuth endpoint configuration is invalid.");
  }

  return tokenEndpoint;
}

function getClientAuthentication(): {
  clientId: string;
  method: "none" | "client_secret_basic" | "client_secret_post";
  secret?: string;
} {
  const clientId = DEFAULT_CLIENT_ID;
  const methodValue =
    process.env.AUTH_STALWART_TOKEN_AUTH_METHOD ?? "client_secret_basic";
  const secret = process.env.AUTH_STALWART_SECRET;

  if (
    !/^[A-Za-z0-9._~-]{1,128}$/.test(clientId) ||
    !["none", "client_secret_basic", "client_secret_post"].includes(
      methodValue,
    ) ||
    (methodValue !== "none" && !secret)
  ) {
    throw new Error("The Stalwart OAuth client authentication is not configured.");
  }

  return {
    clientId,
    method: methodValue as "none" | "client_secret_basic" | "client_secret_post",
    ...(methodValue === "none" ? {} : { secret }),
  };
}

function validateRefreshedToken(value: unknown): RefreshedTokenResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stalwart returned an invalid OAuth token response.");
  }
  const response = value as Partial<RefreshedTokenResponse>;
  if (
    typeof response.access_token !== "string" ||
    !/^[A-Za-z0-9\-._~+/]+=*$/.test(response.access_token) ||
    typeof response.token_type !== "string" ||
    response.token_type.toLowerCase() !== "bearer" ||
    typeof response.expires_in !== "number" ||
    !Number.isFinite(response.expires_in) ||
    response.expires_in <= 0 ||
    response.expires_in > 24 * 60 * 60 ||
    (response.refresh_token !== undefined &&
      (typeof response.refresh_token !== "string" ||
        !/^[A-Za-z0-9\-._~+/]+=*$/.test(response.refresh_token)))
  ) {
    throw new Error("Stalwart returned an invalid OAuth token response.");
  }
  return response as RefreshedTokenResponse;
}

async function refreshOAuthTokens(
  refreshToken: string,
): Promise<RefreshedTokenResponse> {
  const endpoint = getTokenEndpoint();
  const authentication = getClientAuthentication();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: authentication.clientId,
  });
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  });

  if (authentication.method === "client_secret_basic" && authentication.secret) {
    headers.set(
      "authorization",
      `Basic ${encodeOAuthClientBasicCredentials(
        authentication.clientId,
        authentication.secret,
      )}`,
    );
  } else if (
    authentication.method === "client_secret_post" &&
    authentication.secret
  ) {
    body.set("client_secret", authentication.secret);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Stalwart OAuth token refresh failed.");
  }

  if (!response.ok || [301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error("Stalwart OAuth token refresh failed.");
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("Stalwart returned an invalid OAuth token response.");
  }
  return validateRefreshedToken(value);
}

export async function createOAuthSession({
  subject,
  accountId,
  accessToken,
  refreshToken,
  accessTokenExpiresAt,
}: {
  subject: string;
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number;
}): Promise<OAuthSessionHandle> {
  if (
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 512 ||
    !Number.isFinite(accessTokenExpiresAt)
  ) {
    throw new Error("The authenticated Stalwart identity is invalid.");
  }

  const now = Date.now();
  const absoluteExpiry = now + APP_SESSION_MAX_AGE_SECONDS * 1000;
  const expiresAt = new Date(
    refreshToken
      ? absoluteExpiry
      : Math.min(absoluteExpiry, accessTokenExpiresAt),
  );
  if (expiresAt.getTime() <= now) {
    throw new Error("The Stalwart access token is already expired.");
  }

  const sessionId = randomBytes(32).toString("base64url");
  const sessionHash = hashSessionId(sessionId);
  const tokens: StoredOAuthTokens = {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    accessTokenExpiresAt,
    accountId,
  };
  const encryptedTokens = encryptOAuthTokens(sessionHash, tokens);
  const createdAt = new Date(now);
  const sql = getSql();

  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM app_oauth_sessions
      WHERE expires_at <= now()
    `;
    await transaction`
      INSERT INTO app_oauth_sessions (
        session_hash,
        subject,
        encrypted_tokens,
        created_at,
        expires_at
      ) VALUES (
        ${sessionHash},
        ${subject},
        ${encryptedTokens},
        ${createdAt},
        ${expiresAt}
      )
    `;
  });

  return { sessionId, expiresAt };
}

export async function getOAuthSessionSummary(
  sessionId: string,
): Promise<{ expiresAt: Date } | null> {
  const sessionHash = hashSessionId(sessionId);
  const rows = await getSql()<SessionRow[]>`
    SELECT session_hash, subject, encrypted_tokens, expires_at
    FROM app_oauth_sessions
    WHERE session_hash = ${sessionHash}
      AND expires_at > now()
    LIMIT 1
  `;
  const row = rows[0];
  return row ? { expiresAt: dateFromDatabase(row.expires_at) } : null;
}

export async function getAuthenticatedOAuthSession(
  sessionId: string,
): Promise<AuthenticatedOAuthSession | null> {
  const sessionHash = hashSessionId(sessionId);
  const sql = getSql();

  return sql.begin(async (transaction) => {
    const rows = await transaction<SessionRow[]>`
      SELECT session_hash, subject, encrypted_tokens, expires_at
      FROM app_oauth_sessions
      WHERE session_hash = ${sessionHash}
        AND expires_at > now()
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return null;

    const expiresAt = dateFromDatabase(row.expires_at);
    const tokens = decryptOAuthTokens(row.session_hash, row.encrypted_tokens);
    const now = Date.now();

    if (tokens.accessTokenExpiresAt > now + ACCESS_TOKEN_REFRESH_SKEW_MS) {
      return {
        subject: row.subject,
        accountId: tokens.accountId,
        accessToken: tokens.accessToken,
        expiresAt,
      };
    }

    if (!tokens.refreshToken) {
      await transaction`
        DELETE FROM app_oauth_sessions
        WHERE session_hash = ${sessionHash}
      `;
      return null;
    }

    let refreshed: RefreshedTokenResponse;
    try {
      refreshed = await refreshOAuthTokens(tokens.refreshToken);
    } catch {
      await transaction`
        DELETE FROM app_oauth_sessions
        WHERE session_hash = ${sessionHash}
      `;
      return null;
    }

    const updatedTokens: StoredOAuthTokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      accessTokenExpiresAt: now + refreshed.expires_in * 1000,
      accountId: tokens.accountId,
    };
    const encryptedTokens = encryptOAuthTokens(sessionHash, updatedTokens);
    await transaction`
      UPDATE app_oauth_sessions
      SET encrypted_tokens = ${encryptedTokens}
      WHERE session_hash = ${sessionHash}
    `;

    return {
      subject: row.subject,
      accountId: updatedTokens.accountId,
      accessToken: updatedTokens.accessToken,
      expiresAt,
    };
  });
}

export async function revokeOAuthSession(sessionId: string): Promise<void> {
  const sessionHash = hashSessionId(sessionId);
  await getSql()`
    DELETE FROM app_oauth_sessions
    WHERE session_hash = ${sessionHash}
  `;
}
