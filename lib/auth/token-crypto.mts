import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const CIPHER = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface StoredOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number;
  accountId: string;
}

interface TokenEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function getEncryptionKeys(): Buffer[] {
  const active = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!active) {
    throw new Error("OAuth token encryption is not configured.");
  }

  const values = [active, process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS]
    .filter((value): value is string => Boolean(value));
  return values.map((value) => {
    const key = Buffer.from(value, "base64url");
    if (key.length !== 32 || key.toString("base64url") !== value) {
      throw new Error("OAuth token encryption keys must be 32-byte base64url values.");
    }
    return key;
  });
}

function validateSessionHash(sessionHash: string): void {
  if (!/^[a-f0-9]{64}$/.test(sessionHash)) {
    throw new Error("The OAuth session reference is invalid.");
  }
}

function validateStoredTokens(value: unknown): StoredOAuthTokens {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The encrypted OAuth token record is invalid.");
  }

  const tokens = value as Partial<StoredOAuthTokens>;
  if (
    typeof tokens.accessToken !== "string" ||
    !/^[A-Za-z0-9\-._~+/]+=*$/.test(tokens.accessToken) ||
    (tokens.refreshToken !== undefined &&
      (typeof tokens.refreshToken !== "string" ||
        !/^[A-Za-z0-9\-._~+/]+=*$/.test(tokens.refreshToken))) ||
    typeof tokens.accessTokenExpiresAt !== "number" ||
    !Number.isFinite(tokens.accessTokenExpiresAt) ||
    typeof tokens.accountId !== "string" ||
    tokens.accountId.length === 0 ||
    tokens.accountId.length > 256
  ) {
    throw new Error("The encrypted OAuth token record is invalid.");
  }

  return {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    accountId: tokens.accountId,
  };
}

export function encryptOAuthTokens(
  sessionHash: string,
  tokenValue: StoredOAuthTokens,
): string {
  validateSessionHash(sessionHash);
  const tokens = validateStoredTokens(tokenValue);
  const [key] = getEncryptionKeys();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(sessionHash, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);

  const envelope: TokenEnvelope = {
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return JSON.stringify(envelope);
}

export function decryptOAuthTokens(
  sessionHash: string,
  envelopeValue: string,
): StoredOAuthTokens {
  validateSessionHash(sessionHash);
  let envelope: TokenEnvelope;
  try {
    const parsed: unknown = JSON.parse(envelopeValue);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Partial<TokenEnvelope>).version !== 1 ||
      typeof (parsed as Partial<TokenEnvelope>).iv !== "string" ||
      typeof (parsed as Partial<TokenEnvelope>).tag !== "string" ||
      typeof (parsed as Partial<TokenEnvelope>).ciphertext !== "string"
    ) {
      throw new Error();
    }
    envelope = parsed as TokenEnvelope;
  } catch {
    throw new Error("The encrypted OAuth token record is invalid.");
  }

  const iv = Buffer.from(envelope.iv, "base64url");
  const tag = Buffer.from(envelope.tag, "base64url");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("The encrypted OAuth token record is invalid.");
  }

  for (const key of getEncryptionKeys()) {
    try {
      const decipher = createDecipheriv(CIPHER, key, iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(sessionHash, "utf8"));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      return validateStoredTokens(JSON.parse(plaintext) as unknown);
    } catch {
      // Try the previous key during the configured rotation window.
    }
  }

  throw new Error("The encrypted OAuth token record could not be decrypted.");
}
