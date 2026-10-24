import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  runJmapOAuthEmailDetail,
  runJmapOAuthMarkEmailRead,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const accessToken = randomBytes(32).toString("base64url");

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createFetch(options: {
  primaryAccountId?: string;
  emailResponse?: unknown;
  setResponse?: unknown;
} = {}) {
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
      const jmapRequest = JSON.parse(String(init.body));
      const method = jmapRequest.methodCalls[0][0];
      if (method === "Email/get") {
        return responseJson(
          options.emailResponse ?? {
            methodResponses: [
              [
                "Email/get",
                {
                  list: [
                    {
                      id: "email-1",
                      from: [{ name: "Sender", email: "sender@example.test" }],
                      to: [{ name: "Recipient", email: "to@example.test" }],
                      cc: [{ name: null, email: "cc@example.test" }],
                      bcc: [{ name: null, email: "bcc@example.test" }],
                      subject: "A real subject",
                      sentAt: "2026-05-03T08:15:00Z",
                      receivedAt: "2026-05-03T08:16:00Z",
                      keywords: {},
                      textBody: [{ partId: "text-1", type: "text/plain" }],
                      htmlBody: [{ partId: "html-1", type: "text/html" }],
                      bodyValues: {
                        "text-1": { value: "Plain body\nSecond line" },
                        "html-1": {
                          value:
                            '<div onclick="run()">Hello <a href="https://example.test">Open</a>' +
                            '<img src="https://tracker.example/pixel"><script>run()</script></div>',
                        },
                      },
                      attachments: [
                        {
                          name: "report.txt",
                          type: "text/plain",
                          size: 120,
                        },
                      ],
                      mailboxIds: { "inbox-id": true, "archive-id": true },
                    },
                  ],
                  notFound: [],
                },
                "phase3-email-detail-get",
              ],
            ],
          },
        );
      }
      if (method === "Email/set") {
        return responseJson(
          options.setResponse ?? {
            methodResponses: [
              [
                "Email/set",
                { updated: { "email-1": {} }, notUpdated: {} },
                "phase3-email-mark-read",
              ],
            ],
          },
        );
      }
    }

    throw new Error("Unexpected JMAP request target");
  };

  return { fetchImpl, calls };
}

const commonOptions = {
  accessToken,
  expectedAccountId: "account-1",
  emailId: "email-1",
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("retrieves bounded message detail and returns sanitized HTML only", async () => {
  const { fetchImpl, calls } = createFetch();
  const detail = await runJmapOAuthEmailDetail({
    ...commonOptions,
    fetchImpl,
  });

  assert.deepEqual(detail, {
    id: "email-1",
    threadId: "email-1",
    from: [{ name: "Sender", email: "sender@example.test" }],
    replyTo: [],
    to: [{ name: "Recipient", email: "to@example.test" }],
    cc: [{ name: null, email: "cc@example.test" }],
    bcc: [{ name: null, email: "bcc@example.test" }],
    subject: "A real subject",
    sentAt: "2026-05-03T08:15:00.000Z",
    receivedAt: "2026-05-03T08:16:00.000Z",
    isUnread: true,
    isStarred: false,
    isDraft: false,
    messageId: [],
    inReplyTo: [],
    references: [],
    textBody: "Plain body\nSecond line",
    htmlBody: "<div>Hello <span>Open</span></div>",
    externalLinks: ["https://example.test/"],
    bodyTruncated: false,
    attachments: [
      { name: "report.txt", type: "text/plain", size: 120 },
    ],
    mailboxIds: ["inbox-id", "archive-id"],
  });

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(
      new Headers(call.init.headers).get("authorization"),
      `Bearer ${accessToken}`,
    );
  }
  const request = JSON.parse(String(calls[2].init.body));
  const [method, args, callId] = request.methodCalls[0];
  assert.equal(method, "Email/get");
  assert.equal(callId, "phase3-email-detail-get");
  assert.equal(args.accountId, "account-1");
  assert.deepEqual(args.ids, ["email-1"]);
  assert.equal(args.fetchTextBodyValues, true);
  assert.equal(args.fetchHTMLBodyValues, true);
  assert.equal(args.maxBodyValueBytes, 256 * 1024);
  assert.deepEqual(args.bodyProperties, ["partId", "type", "name", "size"]);
  assert.equal(JSON.stringify(args).includes("blobId"), false);
});

test("rejects the primary JMAP account before reading a message", async () => {
  const { fetchImpl, calls } = createFetch({
    primaryAccountId: "different-account",
  });

  await assert.rejects(
    runJmapOAuthEmailDetail({ ...commonOptions, fetchImpl }),
    JmapAccountMismatchError,
  );
  assert.equal(calls.length, 2);
});

test("maps a message missing from Email/get to a not-found error", async () => {
  const { fetchImpl } = createFetch({
    emailResponse: {
      methodResponses: [
        [
          "Email/get",
          { list: [], notFound: ["email-1"] },
          "phase3-email-detail-get",
        ],
      ],
    },
  });

  await assert.rejects(
    runJmapOAuthEmailDetail({ ...commonOptions, fetchImpl }),
    JmapEmailNotFoundError,
  );
});

test("stops reading an oversized Email/get response", async () => {
  const oversized = {
    methodResponses: [
      [
        "Email/get",
        { list: [{ id: "email-1", extra: "x".repeat(1024 * 1024 + 10) }] },
        "phase3-email-detail-get",
      ],
    ],
  };
  const { fetchImpl } = createFetch({ emailResponse: oversized });

  await assert.rejects(
    runJmapOAuthEmailDetail({ ...commonOptions, fetchImpl }),
    /response exceeded the size limit/,
  );
});

test("marks only the seen keyword through JMAP Email/set", async () => {
  const { fetchImpl, calls } = createFetch();
  await runJmapOAuthMarkEmailRead({ ...commonOptions, fetchImpl });

  assert.equal(calls.length, 3);
  const request = JSON.parse(String(calls[2].init.body));
  assert.deepEqual(request.methodCalls[0], [
    "Email/set",
    {
      accountId: "account-1",
      update: { "email-1": { "keywords/$seen": true } },
    },
    "phase3-email-mark-read",
  ]);
});

test("reports when JMAP refuses the read-state update", async () => {
  const { fetchImpl } = createFetch({
    setResponse: {
      methodResponses: [
        [
          "Email/set",
          { updated: {}, notUpdated: { "email-1": { type: "notFound" } } },
          "phase3-email-mark-read",
        ],
      ],
    },
  });

  await assert.rejects(
    runJmapOAuthMarkEmailRead({ ...commonOptions, fetchImpl }),
    JmapEmailNotFoundError,
  );
});
