import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  JmapPocError,
  type JmapEmailMailboxMembership,
} from "../lib/jmap/client.mts";
import {
  createMailMembershipGetHandler,
  type MailMembershipRouteDependencies,
} from "../lib/jmap/mail-membership-route.mts";

const sessionId = randomBytes(32).toString("base64url");
const accessToken = randomBytes(32).toString("base64url");
const membership: JmapEmailMailboxMembership = {
  emailId: "email-1",
  mailboxes: [
    { id: "sent-id", role: "sent" },
    { id: "trash-id", role: "trash" },
  ],
};

function makeHandler(overrides: Partial<MailMembershipRouteDependencies> = {}) {
  const revoked: string[] = [];
  let receivedOptions: unknown;
  const dependencies: MailMembershipRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken, accountId: "account-1" }),
    revokeSession: async (id) => {
      revoked.push(id);
    },
    getMembership: async (options) => {
      receivedOptions = options;
      return membership;
    },
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    ...overrides,
  };
  return {
    GET: createMailMembershipGetHandler(dependencies),
    revoked,
    get receivedOptions() {
      return receivedOptions;
    },
  };
}

function request(query = "") {
  return new Request(`https://webmail.example.test/api/mail/location${query}`);
}

test("returns authenticated mailbox membership with private response headers", async () => {
  const state = makeHandler();
  const response = await state.GET(request("?emailId=email-1"));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, membership);
  assert.deepEqual(state.receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    emailId: "email-1",
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(JSON.stringify(body).includes(accessToken), false);
});

test("rejects absent, duplicated, oversized, and control-character IDs before auth", async () => {
  let sessionCount = 0;
  const state = makeHandler({
    getSessionId: async () => {
      sessionCount += 1;
      return sessionId;
    },
  });

  for (const query of [
    "",
    "?emailId=email-1&emailId=email-2",
    `?emailId=${"a".repeat(257)}`,
    "?emailId=%0A",
  ]) {
    const response = await state.GET(request(query));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
  assert.equal(sessionCount, 0);
});

test("requires an authenticated app session", async () => {
  const state = makeHandler({ getSessionId: async () => null });
  const response = await state.GET(request("?emailId=email-1"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
});

test("revokes account-mismatched sessions and fails closed on revoke failure", async () => {
  const state = makeHandler({
    getMembership: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const response = await state.GET(request("?emailId=email-1"));
  assert.equal(response.status, 401);
  assert.deepEqual(state.revoked, [sessionId]);

  const failing = makeHandler({
    getMembership: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async () => {
      throw new Error("private database error");
    },
  });
  const failedResponse = await failing.GET(request("?emailId=email-1"));
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { error: "mail_unavailable" });
});

test("maps an unavailable email to a generic 404", async () => {
  const state = makeHandler({
    getMembership: async () => {
      throw new JmapEmailNotFoundError();
    },
  });
  const response = await state.GET(request("?emailId=email-1"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "message_not_found" });
});

test("maps malformed upstream membership data to a generic 503", async () => {
  const state = makeHandler({
    getMembership: async () => {
      throw new JmapPocError("private upstream parser detail");
    },
  });
  const response = await state.GET(request("?emailId=email-1"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_unavailable" });
});
