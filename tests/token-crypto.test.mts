import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  decryptOAuthTokens,
  encryptOAuthTokens,
  type StoredOAuthTokens,
} from "../lib/auth/token-crypto.mts";

const sessionHash = randomBytes(32).toString("hex");
const testTokens: StoredOAuthTokens = {
  accessToken: randomBytes(32).toString("base64url"),
  refreshToken: randomBytes(32).toString("base64url"),
  accessTokenExpiresAt: Date.now() + 60_000,
  accountId: "test-account",
};

function withEncryptionKeys<T>(
  keys: { active?: string; previous?: string },
  action: () => T,
): T {
  const originalActive = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  const originalPrevious = process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS;

  if (keys.active === undefined) {
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = keys.active;
  }
  if (keys.previous === undefined) {
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  } else {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS = keys.previous;
  }

  try {
    return action();
  } finally {
    if (originalActive === undefined) {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = originalActive;
    }
    if (originalPrevious === undefined) {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS;
    } else {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
    }
  }
}

test("encrypts OAuth tokens with authenticated encryption and binds them to the session", () => {
  const key = randomBytes(32).toString("base64url");
  withEncryptionKeys({ active: key }, () => {
    const envelope = encryptOAuthTokens(sessionHash, testTokens);
    assert.equal(envelope.includes(testTokens.accessToken), false);
    assert.deepEqual(decryptOAuthTokens(sessionHash, envelope), testTokens);
    assert.throws(
      () => decryptOAuthTokens(randomBytes(32).toString("hex"), envelope),
      /could not be decrypted/,
    );
  });
});

test("supports one previous encryption key while sessions rotate", () => {
  const oldKey = randomBytes(32).toString("base64url");
  const newKey = randomBytes(32).toString("base64url");
  const envelope = withEncryptionKeys({ active: oldKey }, () =>
    encryptOAuthTokens(sessionHash, testTokens),
  );

  withEncryptionKeys({ active: newKey, previous: oldKey }, () => {
    assert.deepEqual(decryptOAuthTokens(sessionHash, envelope), testTokens);
    const rotated = encryptOAuthTokens(sessionHash, testTokens);
    assert.deepEqual(decryptOAuthTokens(sessionHash, rotated), testTokens);
  });
});

test("rejects missing or malformed encryption keys without disclosing values", () => {
  withEncryptionKeys({}, () => {
    assert.throws(
      () => encryptOAuthTokens(sessionHash, testTokens),
      /encryption is not configured/,
    );
  });

  withEncryptionKeys({ active: "short-key" }, () => {
    assert.throws(
      () => encryptOAuthTokens(sessionHash, testTokens),
      /32-byte base64url/,
    );
  });
});
