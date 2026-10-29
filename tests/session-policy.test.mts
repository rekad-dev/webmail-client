import assert from "node:assert/strict";
import test from "node:test";
import { APP_SESSION_MAX_AGE_SECONDS, sessionExpiry } from "../lib/auth/session-policy.mts";
import { LINKED_ACCOUNTS_MAX_AGE_SECONDS } from "../lib/auth/linked-accounts.mts";

test("refreshable sessions and linked accounts share a seven-day maximum", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(APP_SESSION_MAX_AGE_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(LINKED_ACCOUNTS_MAX_AGE_SECONDS, APP_SESSION_MAX_AGE_SECONDS);
  assert.equal(sessionExpiry(now, now + 60_000, true).getTime(), now + 7 * 24 * 60 * 60 * 1000);
});

test("sessions without refresh tokens never outlive the access token or seven days", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(sessionExpiry(now, now + 3_600_000, false).getTime(), now + 3_600_000);
  assert.equal(sessionExpiry(now, now + 30 * 24 * 60 * 60 * 1000, false).getTime(), now + 7 * 24 * 60 * 60 * 1000);
});
