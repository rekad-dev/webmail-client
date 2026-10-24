import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapPocError,
  JmapThreadSubjectSearchIncompleteError,
  type JmapSubjectMatchMetadata,
} from "../lib/jmap/client.mts";
import {
  createMailSubjectMetadataPostHandler,
  type MailSubjectMetadataRouteDependencies,
} from "../lib/jmap/mail-subject-metadata-route.mts";

const sessionId = randomBytes(32).toString("base64url");
const accessToken = randomBytes(32).toString("base64url");
const subject = "Re: Fwd: Test Send";
const metadata: JmapSubjectMatchMetadata = {
  queryCandidateCount: 4,
  exactSubjectMatchCount: 2,
  metadataComplete: true,
  candidates: [
    {
      from: ["first@example.test"],
      sentAt: "2026-10-25T01:02:03.000Z",
      receivedAt: "2026-10-25T01:03:04.000Z",
      mailboxes: [{ id: "sent-mailbox", role: "sent" }],
    },
    {
      from: ["second@example.test"],
      sentAt: null,
      receivedAt: "2026-10-24T22:30:00.000Z",
      mailboxes: [{ id: "inbox-mailbox", role: "inbox" }],
    },
  ],
};

function makeHandler(overrides: Partial<MailSubjectMetadataRouteDependencies> = {}) {
  const revoked: string[] = [];
  let receivedOptions: unknown;
  const dependencies: MailSubjectMetadataRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken, accountId: "account-1" }),
    revokeSession: async (id) => {
      revoked.push(id);
    },
    getSubjectMetadata: async (options) => {
      receivedOptions = options;
      return metadata;
    },
    isTrustedOrigin: () => true,
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    ...overrides,
  };
  return {
    POST: createMailSubjectMetadataPostHandler(dependencies),
    revoked,
    get receivedOptions() {
      return receivedOptions;
    },
  };
}

function request(
  body: unknown = { subject },
  headers: Record<string, string> = { "content-type": "application/json" },
): Request {
  return new Request("https://webmail.example.test/api/mail/subject-metadata", {
    method: "POST",
    headers: { origin: "https://webmail.example.test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("returns only the requested metadata with private response headers", async () => {
  const state = makeHandler();
  const response = await state.POST(request());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, metadata);
  assert.deepEqual(state.receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    subject,
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(JSON.stringify(body).includes(accessToken), false);
  assert.equal(JSON.stringify(body).includes(subject), false);
  assert.equal(JSON.stringify(body).includes("email-1"), false);
});

test("rejects untrusted origins, non-JSON and out-of-scope request fields before auth", async () => {
  let sessionLookups = 0;
  const state = makeHandler({
    getSessionId: async () => {
      sessionLookups += 1;
      return sessionId;
    },
  });

  const untrusted = makeHandler({ isTrustedOrigin: () => false });
  assert.equal((await untrusted.POST(request())).status, 403);
  assert.equal((await state.POST(request({ subject }, { "content-type": "text/plain" }))).status, 400);
  assert.equal((await state.POST(request({ subject, query: "Test Send" }))).status, 400);
  assert.equal(sessionLookups, 0);
});

test("requires an authenticated app session", async () => {
  const state = makeHandler({ getSessionId: async () => null });
  const response = await state.POST(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
});

test("revokes an account-mismatched session and fails closed on revoke failure", async () => {
  const state = makeHandler({
    getSubjectMetadata: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const response = await state.POST(request());
  assert.equal(response.status, 401);
  assert.deepEqual(state.revoked, [sessionId]);

  const failed = makeHandler({
    getSubjectMetadata: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async () => {
      throw new Error("private database error");
    },
  });
  const failedResponse = await failed.POST(request());
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { error: "mail_unavailable" });
});

test("maps an operation deadline to an explicit incomplete response", async () => {
  const state = makeHandler({
    getSubjectMetadata: async () => {
      throw new JmapThreadSubjectSearchIncompleteError();
    },
  });
  const response = await state.POST(request());
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "subject_search_incomplete" });
});

test("keeps malformed upstream failures generic", async () => {
  const state = makeHandler({
    getSubjectMetadata: async () => {
      throw new JmapPocError("private parser detail");
    },
  });
  const response = await state.POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_unavailable" });
});
