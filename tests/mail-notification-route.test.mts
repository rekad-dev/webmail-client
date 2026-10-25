import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapInboxChangesIncompleteError,
} from "../lib/jmap/client.mts";
import {
  createMailNotificationPostHandler,
  type MailNotificationDependencies,
} from "../lib/jmap/mail-notification-route.mts";

const sessionId = randomBytes(32).toString("base64url");
const token = randomBytes(32).toString("base64url");

function settings() {
  return {
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  };
}

function makeHandler(overrides: Partial<MailNotificationDependencies> = {}) {
  const dependencies: MailNotificationDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken: token, accountId: "account-1" }),
    revokeSession: async () => undefined,
    getChanges: async () => ({
      emailState: "state-2",
      newInboxEmailIds: ["email-1"],
      hasMore: false,
      hasInboxChanges: true,
      reset: false,
    }),
    getCacheScope: () => "opaque-scope",
    getJmapSettings: settings,
    isTrustedOrigin: () => true,
    ...overrides,
  };
  return { POST: createMailNotificationPostHandler(dependencies), dependencies };
}

function request(body: unknown = { sinceState: "state-1" }): Request {
  return new Request("https://mail.example.test/api/mail/notifications", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mail.example.test" },
    body: JSON.stringify(body),
  });
}

test("authenticates and returns only bounded inbox change metadata", async () => {
  let received: unknown;
  const { POST } = makeHandler({
    getChanges: async (options) => {
      received = options;
      return {
        emailState: "state-2",
        newInboxEmailIds: ["email-1"],
        hasMore: false,
        hasInboxChanges: true,
        reset: false,
      };
    },
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cacheScope: "opaque-scope",
    emailState: "state-2",
    newInboxEmailIds: ["email-1"],
    hasMore: false,
    hasInboxChanges: true,
    reset: false,
  });
  assert.deepEqual(received, {
    accessToken: token,
    expectedAccountId: "account-1",
    sinceState: "state-1",
    ...settings(),
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("rejects untrusted origin before reading the session", async () => {
  let sessionCalls = 0;
  const { POST } = makeHandler({
    isTrustedOrigin: () => false,
    getSessionId: async () => { sessionCalls += 1; return sessionId; },
  });
  const response = await POST(request());
  assert.equal(response.status, 403);
  assert.equal(sessionCalls, 0);
});

test("revokes a session when the JMAP primary account mismatches", async () => {
  const revoked: string[] = [];
  const { POST } = makeHandler({
    getChanges: async () => { throw new JmapAccountMismatchError(); },
    revokeSession: async (value) => { revoked.push(value); },
  });
  const response = await POST(request());
  assert.equal(response.status, 401);
  assert.deepEqual(revoked, [sessionId]);
});

test("maps an incomplete bounded poll to a retryable response", async () => {
  const { POST } = makeHandler({
    getChanges: async () => { throw new JmapInboxChangesIncompleteError(); },
  });
  const response = await POST(request());
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "notification_sync_incomplete" });
});

test("requires an authenticated app session", async () => {
  const { POST } = makeHandler({ getSessionId: async () => null });
  const response = await POST(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
});
