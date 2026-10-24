import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapMailboxNotFoundError,
  MAX_MAIL_POSITION,
  runJmapOAuthMailboxListing,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createFetch(
  options: { primaryAccountId?: string; emailTotal?: number } = {},
) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });

    if (url.pathname === "/.well-known/jmap") {
      return new Response(null, {
        status: 307,
        headers: { location: "/jmap/session" },
      });
    }
    if (url.pathname === "/jmap/session") {
      const accountId = options.primaryAccountId ?? "account-1";
      return responseJson({
        capabilities: { [CORE]: {}, [MAIL]: {} },
        accounts: {
          [accountId]: { accountCapabilities: { [MAIL]: {} } },
        },
        primaryAccounts: { [MAIL]: accountId },
        apiUrl: `${ORIGIN}/jmap/`,
        uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
        downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
      });
    }
    if (url.pathname === "/jmap/") {
      const request = JSON.parse(String(init.body));
      if (request.methodCalls[0][0] === "Mailbox/get") {
        return responseJson({
          methodResponses: [
            [
              "Mailbox/get",
              {
                list: [
                  {
                    id: "inbox-id",
                    name: "Inbox",
                    role: "inbox",
                    totalEmails: 31,
                    unreadEmails: 4,
                  },
                  {
                    id: "sent-id",
                    name: "Sent",
                    role: "sent",
                    totalEmails: 8,
                    unreadEmails: 0,
                  },
                ],
              },
              "phase0-mailboxes",
            ],
          ],
        });
      }

      return responseJson({
        methodResponses: [
          [
            "Email/query",
            {
              ids: ["email-1", "email-2"],
              position: 0,
              total: options.emailTotal ?? 31,
            },
            "phase2-email-query",
          ],
          [
            "Email/get",
            {
              list: [
                {
                  id: "email-2",
                  from: [{ name: "Sender Two", email: "two@example.test" }],
                  subject: null,
                  receivedAt: "2026-02-02T12:00:00Z",
                  keywords: {},
                  preview: "<em>still plain text</em>",
                  bodyValues: { text: "must not be requested" },
                },
                {
                  id: "email-1",
                  from: [{ name: "Sender One", email: "one@example.test" }],
                  subject: "First subject",
                  receivedAt: "2026-02-01T12:00:00Z",
                  keywords: { "$seen": true },
                  preview: "First preview",
                },
              ],
              notFound: [],
            },
            "phase2-email-get",
          ],
        ],
      });
    }

    throw new Error("Unexpected JMAP request target");
  };

  return { fetchImpl, calls };
}

test("lists the authenticated mailbox and only ordered message summaries", async () => {
  const { fetchImpl, calls } = createFetch();
  const accessToken = randomBytes(32).toString("base64url");

  const result = await runJmapOAuthMailboxListing({
    accessToken,
    expectedAccountId: "account-1",
    position: 0,
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.selectedMailboxId, "inbox-id");
  assert.equal(result.total, 31);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.mailboxes, [
    {
      id: "inbox-id",
      name: "Inbox",
      role: "inbox",
      totalEmails: 31,
      unreadEmails: 4,
    },
    {
      id: "sent-id",
      name: "Sent",
      role: "sent",
      totalEmails: 8,
      unreadEmails: 0,
    },
  ]);
  assert.deepEqual(result.messages, [
    {
      id: "email-1",
      from: [{ name: "Sender One", email: "one@example.test" }],
      subject: "First subject",
      receivedAt: "2026-02-01T12:00:00.000Z",
      preview: "First preview",
      isUnread: false,
    },
    {
      id: "email-2",
      from: [{ name: "Sender Two", email: "two@example.test" }],
      subject: null,
      receivedAt: "2026-02-02T12:00:00.000Z",
      preview: "<em>still plain text</em>",
      isUnread: true,
    },
  ]);

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(
      new Headers(call.init.headers).get("authorization"),
      `Bearer ${accessToken}`,
    );
  }

  const mailboxRequest = JSON.parse(String(calls[2].init.body));
  assert.deepEqual(mailboxRequest.methodCalls[0][1].properties, [
    "id",
    "name",
    "role",
    "totalEmails",
    "unreadEmails",
  ]);
  const emailRequest = JSON.parse(String(calls[3].init.body));
  assert.deepEqual(emailRequest.methodCalls[0][1], {
    accountId: "account-1",
    filter: { inMailbox: "inbox-id" },
    sort: [{ property: "receivedAt", isAscending: false }],
    position: 0,
    limit: 25,
    calculateTotal: true,
  });
  assert.deepEqual(emailRequest.methodCalls[1][1].properties, [
    "id",
    "from",
    "subject",
    "receivedAt",
    "keywords",
    "preview",
  ]);
  assert.deepEqual(emailRequest.methodCalls[1][1]["#ids"], {
    resultOf: "phase2-email-query",
    name: "Email/query",
    path: "/ids",
  });
  assert.equal(
    JSON.stringify(emailRequest).includes("bodyValues"),
    false,
  );
});

test("rejects an account mismatch before reading mailbox or email data", async () => {
  const { fetchImpl, calls } = createFetch({ primaryAccountId: "other-account" });

  await assert.rejects(
    runJmapOAuthMailboxListing({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    JmapAccountMismatchError,
  );
  assert.equal(calls.length, 2);
});

test("rejects a mailbox ID that is not in the authenticated account", async () => {
  const { fetchImpl, calls } = createFetch();

  await assert.rejects(
    runJmapOAuthMailboxListing({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      mailboxId: "another-users-mailbox",
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    JmapMailboxNotFoundError,
  );
  assert.equal(calls.length, 3);
});

test("rejects invalid page positions before sending requests", async () => {
  let fetchCount = 0;

  await assert.rejects(
    runJmapOAuthMailboxListing({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      position: 1,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error("fetch should not run");
      },
    }),
    /email page position is invalid/,
  );
  assert.equal(fetchCount, 0);
});

test("does not offer a next page past the maximum supported position", async () => {
  const { fetchImpl } = createFetch({ emailTotal: MAX_MAIL_POSITION + 50 });

  const result = await runJmapOAuthMailboxListing({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    position: MAX_MAIL_POSITION,
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.total, MAX_MAIL_POSITION + 50);
  assert.equal(result.hasMore, false);
});
