import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapEmailNotFoundError,
  runJmapOAuthRawMessage,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";

function createFetch(options: {
  emailResponse?: Record<string, unknown>;
  rawBody?: BodyInit;
} = {}) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    if (url.pathname === "/.well-known/jmap") {
      return Response.json({
        capabilities: { [CORE]: {}, [MAIL]: {} },
        accounts: { "account-1": { accountCapabilities: { [MAIL]: {} } } },
        primaryAccounts: { [MAIL]: "account-1" },
        apiUrl: `${ORIGIN}/jmap/`,
        uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
        downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}/{type}`,
      });
    }
    if (url.pathname === "/jmap/") {
      const request = JSON.parse(String(init.body)) as { methodCalls: unknown[][] };
      const callId = request.methodCalls[0]?.[2];
      return Response.json({
        methodResponses: [[
          "Email/get",
          options.emailResponse ?? {
            accountId: "account-1",
            state: "s1",
            list: [{ id: "email-1", blobId: "blob-1", size: 24 }],
            notFound: [],
          },
          callId,
        ]],
      });
    }
    if (url.pathname.startsWith("/jmap/download/account-1/blob-1/")) {
      assert.equal(init.redirect, "manual");
      return new Response(options.rawBody ?? "Subject: Hi\r\n\r\nBody text", {
        headers: { "content-type": "message/rfc822" },
      });
    }
    throw new Error(`Unexpected request: ${url.href}`);
  };
  return { fetchImpl, calls };
}

const common = {
  accessToken: "token",
  expectedAccountId: "account-1",
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
  trustedOrigins: [ORIGIN],
  emailId: "email-1",
};

test("downloads the raw message by the email's own blob", async () => {
  const { fetchImpl, calls } = createFetch();
  const result = await runJmapOAuthRawMessage({ ...common, fetchImpl });
  assert.deepEqual(result, { text: "Subject: Hi\r\n\r\nBody text", size: 24, truncated: false });
  const request = JSON.parse(String(calls[1]?.init.body)) as { methodCalls: unknown[][] };
  const args = request.methodCalls[0]?.[1] as Record<string, unknown>;
  assert.deepEqual(args.ids, ["email-1"]);
  assert.deepEqual(args.properties, ["id", "blobId", "size"]);
});

test("truncates raw messages beyond the display limit", async () => {
  const { fetchImpl } = createFetch({ rawBody: "a".repeat(1024 * 1024 + 10) });
  const result = await runJmapOAuthRawMessage({ ...common, fetchImpl });
  assert.equal(result.truncated, true);
  assert.equal(result.text.length, 1024 * 1024);
});

test("does not mark a message of exactly the display limit as truncated", async () => {
  const { fetchImpl } = createFetch({ rawBody: "a".repeat(1024 * 1024) });
  const result = await runJmapOAuthRawMessage({ ...common, fetchImpl });
  assert.equal(result.truncated, false);
});

test("reports a missing email", async () => {
  const { fetchImpl } = createFetch({
    emailResponse: { accountId: "account-1", state: "s1", list: [], notFound: ["email-1"] },
  });
  await assert.rejects(runJmapOAuthRawMessage({ ...common, fetchImpl }), JmapEmailNotFoundError);
});
