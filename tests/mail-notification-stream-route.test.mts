import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { JmapAccountMismatchError } from "../lib/jmap/client.mts";
import {
  createMailNotificationStreamGetHandler,
  type MailNotificationStreamDependencies,
} from "../lib/jmap/mail-notification-stream-route.mts";

const sessionId = randomBytes(32).toString("base64url");
const token = randomBytes(32).toString("base64url");

function settings() {
  return {
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  };
}

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

function makeHandler(overrides: Partial<MailNotificationStreamDependencies> = {}) {
  const dependencies: MailNotificationStreamDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken: token, accountId: "account-1" }),
    revokeSession: async () => undefined,
    openEventStream: async () => ({
      supported: true,
      accountId: "account-1",
      response: makeStreamResponse([
        'event: state\ndata: {"@type":"StateChange","changed":{"account-1":{"Email":"e2"},"other-account":{"Email":"e9"}}}\n\n',
      ]),
    }),
    getJmapSettings: settings,
    isTrustedOrigin: () => true,
    streamLifetimeMs: 2_000,
    keepaliveIntervalMs: 1_000,
    ...overrides,
  };
  return { GET: createMailNotificationStreamGetHandler(dependencies), dependencies };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://webmail.example.test/api/mail/notifications/stream", {
    method: "GET",
    headers,
  });
}

test("requires an authenticated app session", async () => {
  const { GET } = makeHandler({ getSessionId: async () => null });
  const response = await GET(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
});

test("rejects cross-site stream requests before reading session", async () => {
  let sessionCalls = 0;
  const { GET } = makeHandler({
    getSessionId: async () => { sessionCalls += 1; return sessionId; },
  });
  const response = await GET(request({ "sec-fetch-site": "cross-site" }));
  assert.equal(response.status, 403);
  assert.equal(sessionCalls, 0);
});

test("revokes the session on JMAP primary account mismatch", async () => {
  const revoked: string[] = [];
  const { GET } = makeHandler({
    openEventStream: async () => { throw new JmapAccountMismatchError(); },
    revokeSession: async (id) => { revoked.push(id); },
  });
  const response = await GET(request());
  assert.equal(response.status, 401);
  assert.deepEqual(revoked, [sessionId]);
});

test("emits an unsupported event cleanly when the server lacks EventSource", async () => {
  const { GET } = makeHandler({
    openEventStream: async () => ({ supported: false }),
  });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );
  const text = await response.text();
  assert.match(text, /event: unsupported/);
  assert.match(text, /"supported":false/);
});

test("streams ready and account-scoped state events without exposing account ids", async () => {
  const { GET } = makeHandler();
  const response = await GET(request());
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: ready\ndata: \{"supported":true\}/);
  assert.match(text, /event: state\ndata: \{"emailState":"e2","mailboxState":null\}/);
  assert.equal(text.includes("other-account"), false);
  assert.equal(text.includes("account-1"), false);
});

test("emits reconnect before closing when the stream lifetime expires", async () => {
  const neverEnding = new ReadableStream<Uint8Array>({
    start() {
      // Keep upstream open until aborted by lifetime timer.
    },
  });
  const { GET } = makeHandler({
    streamLifetimeMs: 25,
    keepaliveIntervalMs: 5_000,
    openEventStream: async () => ({
      supported: true,
      accountId: "account-1",
      response: new Response(neverEnding, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    }),
  });
  const response = await GET(request());
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: ready/);
  assert.match(text, /event: reconnect/);
});
