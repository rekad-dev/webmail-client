import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { JmapAccountMismatchError } from "../lib/jmap/client.mts";
import {
  createMailIdentitiesGetHandler,
  type MailIdentitiesRouteDependencies,
} from "../lib/jmap/mail-identities-route.mts";

const sessionId = randomBytes(32).toString("base64url");
const accessToken = randomBytes(32).toString("base64url");
const preflight = {
  submissionAvailable: true,
  draftsMailboxId: "drafts-id",
  sentMailboxId: "sent-id",
  identities: [],
};

function makeHandler(overrides: Partial<MailIdentitiesRouteDependencies> = {}) {
  const dependencies: MailIdentitiesRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({
      accessToken,
      accountId: "account-1",
    }),
    revokeSession: async () => undefined,
    getComposePreflight: async () => preflight,
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    ...overrides,
  };
  return {
    handler: createMailIdentitiesGetHandler(dependencies),
    dependencies,
  };
}

function request(): Request {
  return new Request("https://webmail.example.test/api/mail/identities");
}

test("requires an app session and returns uncached identity preflight", async () => {
  let serviceCalls = 0;
  const { handler } = makeHandler({
    getSessionId: async () => null,
    getComposePreflight: async () => {
      serviceCalls += 1;
      return preflight;
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(serviceCalls, 0);
});

test("passes the stored user OAuth session and account to JMAP", async () => {
  let receivedOptions: unknown;
  const { handler } = makeHandler({
    getComposePreflight: async (options) => {
      receivedOptions = options;
      return preflight;
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, preflight);
  assert.deepEqual(receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(JSON.stringify(body).includes(accessToken), false);
});

test("revokes a session after account mismatch and fails closed on revoke errors", async () => {
  const revoked: string[] = [];
  const { handler } = makeHandler({
    getComposePreflight: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async (id) => {
      revoked.push(id);
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
  assert.deepEqual(revoked, [sessionId]);

  const failing = makeHandler({
    getComposePreflight: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async () => {
      throw new Error("database detail must stay private");
    },
  });
  const failedResponse = await failing.handler(request());
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { error: "mail_unavailable" });
});
