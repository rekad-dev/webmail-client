import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_SESSION_IDLE_SECONDS,
  APP_SESSION_MAX_AGE_SECONDS,
  sessionExpiry,
  slidingExpiry,
} from "../lib/auth/session-policy.mts";
import { LINKED_ACCOUNTS_MAX_AGE_SECONDS } from "../lib/auth/linked-accounts.mts";

const DAY_MS = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 0, 1);

test("a new session idles out after seven days, inside a thirty-day limit shared with the cookies", () => {
  assert.equal(APP_SESSION_IDLE_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(APP_SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  assert.equal(LINKED_ACCOUNTS_MAX_AGE_SECONDS, APP_SESSION_MAX_AGE_SECONDS);
  assert.equal(sessionExpiry(start, start + 60_000, true).getTime(), start + 7 * DAY_MS);
});

test("sessions without refresh tokens never outlive the access token or the idle window", () => {
  assert.equal(sessionExpiry(start, start + 3_600_000, false).getTime(), start + 3_600_000);
  assert.equal(sessionExpiry(start, start + 30 * DAY_MS, false).getTime(), start + 7 * DAY_MS);
});

test("using a session moves its end back to a full idle window", () => {
  const createdAt = new Date(start);
  const expiresAt = new Date(start + 7 * DAY_MS);
  const next = slidingExpiry({ now: start + 3 * DAY_MS, createdAt, expiresAt, hasRefreshToken: true });
  assert.equal(next?.getTime(), start + 10 * DAY_MS);
});

test("a use within the hour of the last extension changes nothing", () => {
  const createdAt = new Date(start);
  const now = start + 30 * 60 * 1000;
  assert.equal(slidingExpiry({ now, createdAt, expiresAt: new Date(start + 7 * DAY_MS), hasRefreshToken: true }), null);
  assert.equal(slidingExpiry({ now, createdAt, expiresAt: new Date(now + 7 * DAY_MS - 59 * 60 * 1000), hasRefreshToken: true }), null);
});

test("a session never extends past thirty days from sign-in", () => {
  const createdAt = new Date(start);
  const now = start + 28 * DAY_MS;
  const next = slidingExpiry({ now, createdAt, expiresAt: new Date(now + 2 * DAY_MS - 1), hasRefreshToken: true });
  assert.equal(next, null);
  const earlier = slidingExpiry({ now: start + 27 * DAY_MS, createdAt, expiresAt: new Date(start + 29 * DAY_MS - 2 * 3_600_000), hasRefreshToken: true });
  assert.equal(earlier?.getTime(), start + 30 * DAY_MS);
});

test("sessions that cannot refresh are never extended", () => {
  assert.equal(
    slidingExpiry({ now: start + DAY_MS, createdAt: new Date(start), expiresAt: new Date(start + 3_600_000), hasRefreshToken: false }),
    null,
  );
});
