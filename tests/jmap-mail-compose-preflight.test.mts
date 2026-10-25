import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { runJmapOAuthComposePreflight } from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const SUBMISSION = "urn:ietf:params:jmap:submission";
const TEST_ORIGIN = "https://mail.example.test";
const token = randomBytes(32).toString("base64url");

function session(includeSubmission = true): Record<string, unknown> {
  const capabilities: Record<string, unknown> = { [CORE]: {}, [MAIL]: {} };
  const accountCapabilities: Record<string, unknown> = { [MAIL]: {} };
  if (includeSubmission) {
    capabilities[SUBMISSION] = {};
    accountCapabilities[SUBMISSION] = { maxDelayedSend: 0 };
  }
  return {
    capabilities,
    accounts: {
      "account-1": { accountCapabilities },
    },
    primaryAccounts: { [MAIL]: "account-1" },
    apiUrl: `${TEST_ORIGIN}/jmap/`,
    uploadUrl: `${TEST_ORIGIN}/jmap/upload/{accountId}/`,
    downloadUrl: `${TEST_ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function makeFetch(includeSubmission = true) {
  const apiRequests: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/.well-known/jmap") {
      return jsonResponse(session(includeSubmission));
    }
    if (url.pathname !== "/jmap/") throw new Error("Unexpected JMAP URL");

    const authorization = new Headers(init?.headers).get("authorization");
    assert.equal(authorization, `Bearer ${token}`);
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    apiRequests.push(requestBody);
    const methodCalls = requestBody.methodCalls as unknown[][];
    const responses = methodCalls.map(([method, _args, callId]) => {
      if (method === "Mailbox/get") {
        return [
          "Mailbox/get",
          {
            state: "mailbox-state-1",
            list: [
              { id: "drafts-1", name: "Drafts", role: "drafts" },
              { id: "sent-1", name: "Sent items", role: "sent" },
            ],
          },
          callId,
        ];
      }
      if (method === "Identity/get") {
        return [
          "Identity/get",
          {
            list: [
              {
                id: "identity-1",
                name: "Example Sender",
                email: "sender@example.test",
                replyTo: [{ name: null, email: "reply@example.test" }],
                bcc: null,
                textSignature: "— Example",
                htmlSignature: "<b>ignored</b>",
              },
            ],
            notFound: [],
          },
          callId,
        ];
      }
      throw new Error(`Unexpected JMAP method ${String(method)}`);
    });
    return jsonResponse({ methodResponses: responses });
  };

  return { fetchImpl, apiRequests };
}

test("checks account submission capability, Drafts/Sent roles, and minimal identities", async () => {
  const { fetchImpl, apiRequests } = makeFetch();
  const result = await runJmapOAuthComposePreflight({
    accessToken: token,
    expectedAccountId: "account-1",
    sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.deepEqual(result, {
    submissionAvailable: true,
    draftsMailboxId: "drafts-1",
    sentMailboxId: "sent-1",
    identities: [
      {
        id: "identity-1",
        name: "Example Sender",
        email: "sender@example.test",
        isWildcard: false,
        replyTo: [{ name: null, email: "reply@example.test" }],
        bcc: [],
        textSignature: "— Example",
      },
    ],
  });
  assert.equal(apiRequests.length, 2);
  assert.deepEqual(
    (apiRequests[1].methodCalls as unknown[][])[0],
    ["Identity/get", { accountId: "account-1", ids: null }, "phase4-identity-get"],
  );
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(result).includes("htmlSignature"), false);
});

test("does not call Identity/get if submission capability is unavailable", async () => {
  const { fetchImpl, apiRequests } = makeFetch(false);
  const result = await runJmapOAuthComposePreflight({
    accessToken: token,
    expectedAccountId: "account-1",
    sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.submissionAvailable, false);
  assert.deepEqual(result.identities, []);
  assert.equal(result.draftsMailboxId, "drafts-1");
  assert.equal(result.sentMailboxId, "sent-1");
  assert.equal(apiRequests.length, 1);
});

test("rejects an account mismatch before requesting account data", async () => {
  const { fetchImpl, apiRequests } = makeFetch();
  await assert.rejects(
    runJmapOAuthComposePreflight({
      accessToken: token,
      expectedAccountId: "other-account",
      sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    /does not match the authenticated app session/,
  );
  assert.equal(apiRequests.length, 0);
});
