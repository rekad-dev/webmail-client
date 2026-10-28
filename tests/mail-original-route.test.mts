import assert from "node:assert/strict";
import test from "node:test";

import { JmapAccountMismatchError, JmapEmailNotFoundError } from "../lib/jmap/client.mts";
import {
  createMailOriginalHandler,
  type MailOriginalDependencies,
} from "../lib/jmap/mail-original-route.mts";

function makeHandler(overrides: Partial<MailOriginalDependencies> = {}) {
  let revoked = 0;
  const dependencies: MailOriginalDependencies = {
    getSessionId: async () => "session-1",
    getAuthenticatedSession: async () => ({ accessToken: "token", accountId: "account-1" }),
    revokeSession: async () => {
      revoked += 1;
    },
    getRawMessage: async () => ({ text: "Subject: Hi\r\n\r\nBody", size: 20, truncated: false }),
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    ...overrides,
  };
  return { GET: createMailOriginalHandler(dependencies), revoked: () => revoked };
}

const url = "https://app.example.test/api/mail/original?emailId=email-1";

test("returns the raw message without caching", async () => {
  const response = await makeHandler().GET(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    text: "Subject: Hi\r\n\r\nBody",
    size: 20,
    truncated: false,
  });
});

test("rejects missing, repeated, and oversized message IDs", async () => {
  const { GET } = makeHandler();
  for (const query of ["", "?emailId=a&emailId=b", `?emailId=${"x".repeat(257)}`]) {
    const response = await GET(new Request(`https://app.example.test/api/mail/original${query}`));
    assert.equal(response.status, 400);
  }
});

test("requires an authenticated session", async () => {
  const noCookie = await makeHandler({ getSessionId: async () => null }).GET(new Request(url));
  assert.equal(noCookie.status, 401);
  const noSession = await makeHandler({ getAuthenticatedSession: async () => null }).GET(new Request(url));
  assert.equal(noSession.status, 401);
});

test("maps missing messages and account mismatches", async () => {
  const missing = await makeHandler({
    getRawMessage: async () => {
      throw new JmapEmailNotFoundError();
    },
  }).GET(new Request(url));
  assert.equal(missing.status, 404);

  const mismatch = makeHandler({
    getRawMessage: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const response = await mismatch.GET(new Request(url));
  assert.equal(response.status, 401);
  assert.equal(mismatch.revoked(), 1);
});

test("reports other failures as unavailable without details", async () => {
  const response = await makeHandler({
    getRawMessage: async () => {
      throw new Error("secret detail");
    },
  }).GET(new Request(url));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_unavailable" });
});
