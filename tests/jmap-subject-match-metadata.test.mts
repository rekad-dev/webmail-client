import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapPocError,
  runJmapOAuthSubjectMatchMetadata,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const SUBJECT = "Re: Fwd: Test Send";

function responseJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createFetch(options: {
  primaryAccountId?: string;
  queryIds?: string[];
  queryTotal?: number;
  candidateSubjects?: Record<string, string>;
  missingMetadataIds?: string[];
  malformedMetadataCoverage?: boolean;
} = {}) {
  const queryIds = options.queryIds ?? ["email-1", "email-2"];
  const subjects = {
    "email-1": SUBJECT,
    "email-2": "Fwd: Test Send",
    "email-3": "Other Test Send",
    "email-4": "Test Send follow-up",
    ...options.candidateSubjects,
  };
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
        capabilities: { [CORE]: { maxObjectsInGet: 2 }, [MAIL]: {} },
        accounts: { [accountId]: { accountCapabilities: { [MAIL]: {} } } },
        primaryAccounts: { [MAIL]: accountId },
        apiUrl: `${ORIGIN}/jmap/`,
        uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
        downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
      });
    }
    assert.equal(url.pathname, "/jmap/");

    const jmapRequest = JSON.parse(String(init.body));
    const [method, args, callId] = jmapRequest.methodCalls[0];
    if (method === "Email/query") {
      return responseJson({
        methodResponses: [[
          "Email/query",
          { ids: queryIds, total: options.queryTotal ?? queryIds.length },
          callId,
        ]],
      });
    }
    if (method === "Mailbox/get") {
      return responseJson({
        methodResponses: [[
          "Mailbox/get",
          {
            list: [
              { id: "sent-mailbox", role: "sent" },
              { id: "trash-mailbox", role: "trash" },
              { id: "inbox-mailbox", role: "inbox" },
            ],
          },
          callId,
        ]],
      });
    }
    assert.equal(method, "Email/get");
    const ids = args.ids as string[];
    if (callId === "phase5-thread-subject-lookup-get") {
      return responseJson({
        methodResponses: [[
          "Email/get",
          {
            list: ids.map((id) => ({
              id,
              threadId: "thread-1",
              subject: subjects[id as keyof typeof subjects] ?? "",
            })),
            notFound: [],
          },
          callId,
        ]],
      });
    }

    assert.equal(callId, "phase5-subject-metadata-get");
    const missing = new Set(options.missingMetadataIds ?? []);
    return responseJson({
      methodResponses: [[
        "Email/get",
        {
          list: options.malformedMetadataCoverage
            ? []
            : ids.filter((id) => !missing.has(id)).map((id) => ({
              id,
              threadId: "thread-1",
              subject: subjects[id as keyof typeof subjects],
              from: [{ email: id === "email-1" ? "first@example.test" : "second@example.test" }],
              sentAt: id === "email-1" ? "2026-10-25T01:02:03Z" : null,
              receivedAt: id === "email-1" ? "2026-10-25T01:03:04Z" : "2026-10-24T22:30:00Z",
              mailboxIds: id === "email-1"
                ? { "sent-mailbox": true }
                : { "inbox-mailbox": true, "trash-mailbox": true },
            })),
          notFound: options.malformedMetadataCoverage
            ? []
            : [...missing].filter((id) => ids.includes(id)),
        },
        callId,
      ]],
    });
  };
  return { fetchImpl, calls };
}

const commonOptions = {
  accessToken: "opaque-test-token",
  expectedAccountId: "account-1",
  subject: SUBJECT,
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("returns only approved metadata for exactly two exact-subject candidates", async () => {
  const { fetchImpl, calls } = createFetch({
    queryIds: ["email-1", "email-2", "email-3", "email-4"],
    candidateSubjects: {
      "email-1": SUBJECT,
      "email-2": SUBJECT,
      "email-3": "Other Test Send",
      "email-4": "Test Send follow-up",
    },
  });
  const result = await runJmapOAuthSubjectMatchMetadata({
    ...commonOptions,
    fetchImpl,
  });

  assert.deepEqual(result, {
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
        mailboxes: [
          { id: "inbox-mailbox", role: "inbox" },
          { id: "trash-mailbox", role: "trash" },
        ],
      },
    ],
  });

  const apiRequests = calls
    .filter((call) => call.url.pathname === "/jmap/")
    .map((call) => JSON.parse(String(call.init.body)));
  const methodCalls = apiRequests.flatMap((request) => request.methodCalls);
  assert.deepEqual(methodCalls[0][1].filter, { subject: "Test Send" });
  assert.deepEqual(methodCalls.map((call) => call[0]), [
    "Email/query",
    "Email/get",
    "Email/get",
    "Email/get",
    "Mailbox/get",
  ]);
  const metadataGets = methodCalls.filter(
    (call) => call[2] === "phase5-subject-metadata-get",
  );
  assert.equal(metadataGets.length, 1);
  assert.deepEqual(metadataGets[0][1].ids, ["email-1", "email-2"]);
  assert.deepEqual(metadataGets[0][1].properties, [
    "id",
    "threadId",
    "subject",
    "from",
    "sentAt",
    "receivedAt",
    "mailboxIds",
  ]);
  assert.deepEqual(methodCalls.at(-1)[1].properties, ["id", "role"]);
  assert.equal(methodCalls.some((call) => call[0] === "Email/set"), false);
  assert.equal(methodCalls.some((call) => call[0] === "Thread/get"), false);
  assert.equal(JSON.stringify(apiRequests).includes("bodyValues"), false);
  assert.equal(JSON.stringify(apiRequests).includes("preview"), false);
  assert.equal(JSON.stringify(apiRequests).includes("textBody"), false);
  assert.equal(JSON.stringify(apiRequests).includes("htmlBody"), false);
  assert.equal(JSON.stringify(result).includes("subject"), false);
  assert.equal(JSON.stringify(result).includes("email-1"), false);
  assert.equal(JSON.stringify(result).includes("thread-1"), false);
});

test("does not fetch exact-match metadata unless exactly two candidates match", async () => {
  const { fetchImpl, calls } = createFetch({
    queryIds: ["email-1", "email-2"],
    candidateSubjects: {
      "email-1": SUBJECT,
      "email-2": "Not the exact subject",
    },
  });
  const result = await runJmapOAuthSubjectMatchMetadata({
    ...commonOptions,
    fetchImpl,
  });

  assert.equal(result.exactSubjectMatchCount, 1);
  assert.equal(result.metadataComplete, true);
  assert.deepEqual(result.candidates, []);
  const methods = calls
    .filter((call) => call.url.pathname === "/jmap/")
    .flatMap((call) => JSON.parse(String(call.init.body)).methodCalls);
  assert.equal(methods.some((call) => call[2] === "phase5-subject-metadata-get"), false);
  assert.equal(methods.some((call) => call[0] === "Mailbox/get"), false);
});

test("returns no partial metadata when an exact candidate disappears", async () => {
  const { fetchImpl } = createFetch({
    missingMetadataIds: ["email-2"],
    candidateSubjects: { "email-2": SUBJECT },
  });
  const result = await runJmapOAuthSubjectMatchMetadata({
    ...commonOptions,
    fetchImpl,
  });

  assert.deepEqual(result, {
    queryCandidateCount: 2,
    exactSubjectMatchCount: 2,
    metadataComplete: false,
    candidates: [],
  });
});

test("rejects malformed metadata coverage and account mismatch", async () => {
  const malformed = createFetch({
    malformedMetadataCoverage: true,
    candidateSubjects: { "email-2": SUBJECT },
  });
  await assert.rejects(
    runJmapOAuthSubjectMatchMetadata({ ...commonOptions, fetchImpl: malformed.fetchImpl }),
    JmapPocError,
  );

  const mismatch = createFetch({ primaryAccountId: "another-account" });
  await assert.rejects(
    runJmapOAuthSubjectMatchMetadata({ ...commonOptions, fetchImpl: mismatch.fetchImpl }),
    JmapAccountMismatchError,
  );
  assert.equal(
    mismatch.calls.some((call) => call.url.pathname === "/jmap/"),
    false,
  );
});
