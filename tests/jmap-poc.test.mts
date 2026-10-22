import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { runJmapPoc } from "../lib/jmap/phase0-poc.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const TEST_ORIGIN = "https://mail.example.test";
const ephemeralTestPassword = randomBytes(32).toString("base64url");

function testSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    capabilities: { [CORE]: {}, [MAIL]: {} },
    accounts: {
      "test-account": {
        accountCapabilities: { [MAIL]: {} },
      },
    },
    primaryAccounts: { [MAIL]: "test-account" },
    apiUrl: `${TEST_ORIGIN}/jmap/`,
    uploadUrl: `${TEST_ORIGIN}/jmap/upload/{accountId}/`,
    downloadUrl: `${TEST_ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
    eventSourceUrl: `${TEST_ORIGIN}/jmap/eventsource/`,
    ...overrides,
  };
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch(session: Record<string, unknown> = testSession()) {
  const calls: Array<{ url: URL; options: RequestInit }> = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    options: RequestInit = {},
  ): Promise<Response> => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(requestUrl);
    calls.push({ url, options });

    if (url.pathname === "/.well-known/jmap") {
      return new Response(null, {
        status: 307,
        headers: { location: "/jmap/session" },
      });
    }

    if (url.pathname === "/jmap/session") {
      return responseJson(session);
    }

    if (url.pathname === "/jmap/") {
      return responseJson({
        methodResponses: [
          [
            "Mailbox/get",
            {
              list: [
                { id: "mailbox-1", role: "inbox", name: "Hidden from output" },
                { id: "mailbox-2", role: "sent", name: "Also hidden" },
              ],
            },
            "phase0-mailboxes",
          ],
        ],
      });
    }

    throw new Error("Unexpected request target");
  };

  return { fetchImpl, calls };
}

test("performs authenticated, read-only Mailbox/get with discovered endpoints", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await runJmapPoc({
    sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
    username: "smoke@example.test",
    password: ephemeralTestPassword,
    fetchImpl,
  });

  assert.deepEqual(result, {
    authenticated: true,
    mailboxCount: 2,
    roles: ["inbox", "sent"],
  });
  if (!result.authenticated) throw new Error("Expected authenticated result");
  assert.equal(calls.length, 3);
  const firstAuthorization = new Headers(calls[0].options.headers).get(
    "authorization",
  );
  assert.ok(firstAuthorization?.startsWith("Basic "));
  assert.equal(
    new Headers(calls[1].options.headers).get("authorization"),
    firstAuthorization,
  );
  assert.equal(
    new Headers(calls[2].options.headers).get("authorization"),
    firstAuthorization,
  );

  const requestBody = calls[2].options.body;
  assert.equal(typeof requestBody, "string");
  if (typeof requestBody !== "string") {
    throw new Error("Expected a JSON request body");
  }
  const apiRequest = JSON.parse(requestBody);
  assert.deepEqual(apiRequest.using, [CORE, MAIL]);
  assert.deepEqual(apiRequest.methodCalls, [
    ["Mailbox/get", { accountId: "test-account", ids: null }, "phase0-mailboxes"],
  ]);
  assert.equal(calls[2].options.redirect, "manual");
});

test("discovery-only mode validates advertised endpoints without mailbox access", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await runJmapPoc({
    sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
    discoveryOnly: true,
    fetchImpl,
  });

  if (result.authenticated) throw new Error("Expected discovery-only result");
  assert.equal(result.authenticated, false);
  assert.deepEqual(Object.keys(result.endpointOrigins).sort(), [
    "apiUrl",
    "downloadUrl",
    "eventSourceUrl",
    "uploadUrl",
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls.every(({ options }) => options.method === "GET"), true);
});

test("rejects an untrusted session redirect before sending credentials", async () => {
  const calls: Array<{ url: URL; options: RequestInit }> = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    options: RequestInit = {},
  ): Promise<Response> => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    calls.push({ url: new URL(requestUrl), options });
    return new Response(null, {
      status: 307,
      headers: { location: "https://attacker.example/session" },
    });
  };

  await assert.rejects(
    runJmapPoc({
      sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
      username: "smoke@example.test",
      password: ephemeralTestPassword,
      fetchImpl,
    }),
    /outside STALWART_JMAP_TRUSTED_ORIGINS/,
  );
  assert.equal(calls.length, 1);
});

test("rejects an advertised API URL outside configured trusted origins", async () => {
  const { fetchImpl, calls } = makeFetch(
    testSession({ apiUrl: "https://api.attacker.example/jmap/" }),
  );

  await assert.rejects(
    runJmapPoc({
      sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
      username: "smoke@example.test",
      password: ephemeralTestPassword,
      fetchImpl,
    }),
    /outside STALWART_JMAP_TRUSTED_ORIGINS/,
  );
  assert.equal(calls.length, 2);
});

test("rejects public HTTP even when private-network HTTP is enabled", async () => {
  await assert.rejects(
    runJmapPoc({
      sessionUrl: "http://mail.example.test/.well-known/jmap",
      trustedOrigins: ["http://mail.example.test"],
      allowInsecureHttp: true,
      discoveryOnly: true,
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    }),
    /HTTPS/,
  );
});

test("permits explicitly configured private HTTP origins for isolated networks", async () => {
  const privateOrigin = "http://stalwart:8080";
  const { fetchImpl } = makeFetch(
    testSession({
      apiUrl: `${privateOrigin}/jmap/`,
      uploadUrl: `${privateOrigin}/jmap/upload/{accountId}/`,
      downloadUrl: `${privateOrigin}/jmap/download/{accountId}/{blobId}/{name}`,
      eventSourceUrl: `${privateOrigin}/jmap/eventsource/`,
    }),
  );

  const result = await runJmapPoc({
    sessionUrl: `${privateOrigin}/.well-known/jmap`,
    trustedOrigins: [privateOrigin],
    allowInsecureHttp: true,
    username: "smoke@example.test",
    password: ephemeralTestPassword,
    fetchImpl,
  });

  if (!result.authenticated) throw new Error("Expected authenticated result");
  assert.equal(result.mailboxCount, 2);
});

test("requires both credentials for the authenticated smoke check", async () => {
  await assert.rejects(
    runJmapPoc({
      sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
      username: "smoke@example.test",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    }),
    /Set both JMAP_TEST_USERNAME and JMAP_TEST_PASSWORD/,
  );
});
