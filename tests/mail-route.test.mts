import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapMailboxNotFoundError,
  type JmapMailboxListing,
} from "../lib/jmap/client.mts";
import {
  createMailGetHandler,
  type MailRouteDependencies,
} from "../lib/jmap/mail-route.mts";

const accessToken = randomBytes(32).toString("base64url");
const sessionId = randomBytes(32).toString("base64url");
const listing: JmapMailboxListing = {
  mailboxes: [
    {
      id: "inbox-id",
      name: "Inbox",
      role: "inbox",
      totalEmails: 0,
      unreadEmails: 0,
    },
  ],
  selectedMailboxId: "inbox-id",
  position: 0,
  pageSize: 25,
  total: 0,
  hasMore: false,
  messages: [],
};

function makeHandler(overrides: Partial<MailRouteDependencies> = {}) {
  const dependencies: MailRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({
      accessToken,
      accountId: "account-1",
    }),
    revokeSession: async () => undefined,
    listMail: async () => listing,
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    ...overrides,
  };

  return { handler: createMailGetHandler(dependencies), dependencies };
}

function request(query = ""): Request {
  return new Request(`https://webmail.example.test/api/mail${query}`);
}

test("returns uncached 401 before session lookup when no app session exists", async () => {
  let sessionLookupCount = 0;
  let listingCount = 0;
  const { handler } = makeHandler({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return null;
    },
    listMail: async () => {
      listingCount += 1;
      return listing;
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(sessionLookupCount, 1);
  assert.equal(listingCount, 0);
});

test("rejects invalid pagination before reading the app session", async () => {
  let sessionLookupCount = 0;
  const { handler } = makeHandler({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return null;
    },
  });

  const response = await handler(request("?position=1"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
  assert.equal(sessionLookupCount, 0);
});

test("passes the stored OAuth identity and bounded request to JMAP", async () => {
  let receivedOptions: unknown;
  const { handler } = makeHandler({
    listMail: async (options) => {
      receivedOptions = options;
      return listing;
    },
  });

  const response = await handler(
    request("?mailboxId=inbox-id&position=25"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), listing);
  assert.deepEqual(receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    mailboxId: "inbox-id",
    position: 25,
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(JSON.stringify(listing).includes(accessToken), false);
});

test("revokes an app session after a JMAP account mismatch", async () => {
  const revoked: string[] = [];
  const { handler } = makeHandler({
    listMail: async () => {
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
});

test("fails closed with a generic 503 when mismatch revocation fails", async () => {
  const { handler } = makeHandler({
    listMail: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async () => {
      throw new Error("database details must not reach the response");
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_unavailable" });
});

test("maps a missing mailbox to 404 without leaking server details", async () => {
  const { handler } = makeHandler({
    listMail: async () => {
      throw new JmapMailboxNotFoundError();
    },
  });

  const response = await handler(request("?mailboxId=missing"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "mailbox_not_found" });
});

test("maps upstream and session-store errors to a generic 503", async () => {
  for (const overrides of [
    {
      getAuthenticatedSession: async () => {
        throw new Error("database details must not reach the response");
      },
    },
    {
      listMail: async () => {
        throw new Error("upstream details must not reach the response");
      },
    },
  ]) {
    const { handler } = makeHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "mail_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
