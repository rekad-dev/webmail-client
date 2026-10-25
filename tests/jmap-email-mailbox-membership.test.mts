import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  JmapPocError,
  JmapThreadSubjectSearchIncompleteError,
  runJmapOAuthEmailMailboxMembership,
  runJmapOAuthThreadSubjectCandidates,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";

function responseJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createFetch(options: {
  primaryAccountId?: string;
  emailResponse?: unknown;
  mailboxResponse?: unknown;
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
      const [method, , callId] = jmapRequest.methodCalls[0];
      if (method === "Email/get") {
        return responseJson(options.emailResponse ?? {
          methodResponses: [[
            "Email/get",
            {
              list: [{
                id: "email-target",
                mailboxIds: { "sent-mailbox": true, "trash-mailbox": true },
              }],
              notFound: [],
            },
            callId,
          ]],
        });
      }
      if (method === "Mailbox/get") {
        return responseJson(options.mailboxResponse ?? {
          methodResponses: [[
            "Mailbox/get",
            {
              state: "mailbox-state-1",
              list: [
                { id: "inbox-mailbox", role: "inbox" },
                { id: "sent-mailbox", role: "sent" },
                { id: "trash-mailbox", role: "trash" },
              ],
            },
            callId,
          ]],
        });
      }
    }

    throw new Error("Unexpected JMAP request target");
  };

  return { fetchImpl, calls };
}

const commonOptions = {
  accessToken: "opaque-test-token",
  expectedAccountId: "account-1",
  emailId: "email-target",
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("reads only one message's mailbox IDs and roles", async () => {
  const { fetchImpl, calls } = createFetch();
  const result = await runJmapOAuthEmailMailboxMembership({
    ...commonOptions,
    fetchImpl,
  });

  assert.deepEqual(result, {
    emailId: "email-target",
    mailboxes: [
      { id: "sent-mailbox", role: "sent" },
      { id: "trash-mailbox", role: "trash" },
    ],
  });
  assert.equal(calls.length, 4);
  const methods = calls.slice(2).map((call) => {
    const request = JSON.parse(String(call.init.body));
    const [method, args] = request.methodCalls[0];
    return { method, args };
  });
  const emailGet = methods.find(({ method }) => method === "Email/get");
  assert.ok(emailGet);
  assert.deepEqual(emailGet.args.ids, ["email-target"]);
  assert.deepEqual(emailGet.args.properties, ["id", "mailboxIds"]);
  assert.equal("fetchTextBodyValues" in emailGet.args, false);
  assert.equal("fetchHTMLBodyValues" in emailGet.args, false);
  assert.equal("bodyProperties" in emailGet.args, false);

  const mailboxGet = methods.find(({ method }) => method === "Mailbox/get");
  assert.ok(mailboxGet);
  assert.deepEqual(mailboxGet.args.properties, ["id", "role"]);
  assert.equal(JSON.stringify(result).includes("subject"), false);
  assert.equal(JSON.stringify(result).includes("preview"), false);
  assert.equal(JSON.stringify(result).includes("body"), false);
});

test("rejects a different primary account before mailbox reads", async () => {
  const { fetchImpl, calls } = createFetch({ primaryAccountId: "another-account" });
  await assert.rejects(
    runJmapOAuthEmailMailboxMembership({ ...commonOptions, fetchImpl }),
    JmapAccountMismatchError,
  );
  assert.equal(calls.length, 2);
});

test("reports an email that is no longer available", async () => {
  const { fetchImpl } = createFetch({
    emailResponse: {
      methodResponses: [[
        "Email/get",
        { list: [], notFound: ["email-target"] },
        "phase5-action-email-get",
      ]],
    },
  });
  await assert.rejects(
    runJmapOAuthEmailMailboxMembership({ ...commonOptions, fetchImpl }),
    JmapEmailNotFoundError,
  );
});

test("fails closed if Email/get omits the requested mailboxIds property", async () => {
  const { fetchImpl } = createFetch({
    emailResponse: {
      methodResponses: [[
        "Email/get",
        { list: [{ id: "email-target" }], notFound: [] },
        "phase5-action-email-get",
      ]],
    },
  });
  await assert.rejects(
    runJmapOAuthEmailMailboxMembership({ ...commonOptions, fetchImpl }),
    JmapPocError,
  );
});

test("rejects omitted and contradictory Email/get notFound coverage", async () => {
  const invalidResponses = [
    {
      methodResponses: [[
        "Email/get",
        { list: [], notFound: [] },
        "phase5-action-email-get",
      ]],
    },
    {
      methodResponses: [[
        "Email/get",
        { list: [{ id: "email-target", mailboxIds: { "sent-mailbox": true } }] },
        "phase5-action-email-get",
      ]],
    },
    {
      methodResponses: [[
        "Email/get",
        {
          list: [{ id: "email-target", mailboxIds: { "sent-mailbox": true } }],
          notFound: ["email-target"],
        },
        "phase5-action-email-get",
      ]],
    },
  ];

  for (const emailResponse of invalidResponses) {
    const { fetchImpl } = createFetch({ emailResponse });
    await assert.rejects(
      runJmapOAuthEmailMailboxMembership({ ...commonOptions, fetchImpl }),
      JmapPocError,
    );
  }
});

test("bounds session discovery and JMAP reads with one operation deadline", async () => {
  function createHangingFetch(): typeof fetch {
    const { fetchImpl: baseFetch } = createFetch();
    return async (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname !== "/jmap/") return baseFetch(input, init);
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
  }

  const results = await Promise.allSettled([
    runJmapOAuthEmailMailboxMembership({
      ...commonOptions,
      fetchImpl: createHangingFetch(),
    }),
    runJmapOAuthThreadSubjectCandidates({
      accessToken: commonOptions.accessToken,
      expectedAccountId: commonOptions.expectedAccountId,
      query: "Test Send",
      sessionUrl: commonOptions.sessionUrl,
      fetchImpl: createHangingFetch(),
    }),
  ]);

  assert.equal(results[0].status, "rejected");
  if (results[0].status === "rejected") {
    assert.ok(results[0].reason instanceof JmapPocError);
    assert.equal(
      results[0].reason instanceof JmapThreadSubjectSearchIncompleteError,
      false,
    );
  }
  assert.equal(results[1].status, "rejected");
  if (results[1].status === "rejected") {
    assert.ok(results[1].reason instanceof JmapThreadSubjectSearchIncompleteError);
  }
});
