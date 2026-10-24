import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapThreadSubjectAmbiguousError,
  JmapThreadSubjectSearchIncompleteError,
} from "../lib/jmap/client.mts";
import {
  createMailThreadSubjectsPostHandler,
  type MailThreadSubjectsRouteDependencies,
} from "../lib/jmap/mail-thread-subjects-route.mts";

function request(body: unknown) {
  return new Request("https://webmail.example.test/api/mail/thread-subjects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://webmail.example.test",
    },
    body: JSON.stringify(body),
  });
}

function createDependencies(
  overrides: Partial<MailThreadSubjectsRouteDependencies> = {},
) {
  const revoked: string[] = [];
  let receivedSubject: string | null = null;
  const dependencies: MailThreadSubjectsRouteDependencies = {
    getSessionId: async () => "session-1",
    getAuthenticatedSession: async () => ({
      accessToken: "opaque-test-token",
      accountId: "account-1",
    }),
    revokeSession: async (sessionId) => {
      revoked.push(sessionId);
    },
    getThreadSubjects: async ({ subject }) => {
      receivedSubject = subject;
      return {
        threadId: "thread-1",
        members: [
          { id: "email-1", subject: "Test" },
          { id: "email-2", subject: "Fwd: Test Send" },
        ],
        truncated: false,
      };
    },
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    isTrustedOrigin: () => true,
    ...overrides,
  };
  return { dependencies, revoked, get receivedSubject() { return receivedSubject; } };
}

test("returns only authenticated thread subject metadata with no-store headers", async () => {
  const state = createDependencies();
  const POST = createMailThreadSubjectsPostHandler(state.dependencies);
  const response = await POST(request({ subject: "Fwd: Test Send" }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.equal(state.receivedSubject, "Fwd: Test Send");
  assert.deepEqual(await response.json(), {
    threadId: "thread-1",
    members: [
      { id: "email-1", subject: "Test" },
      { id: "email-2", subject: "Fwd: Test Send" },
    ],
    truncated: false,
  });
});

test("rejects invalid subjects before session lookup", async () => {
  let sessionLookupCount = 0;
  const { dependencies } = createDependencies({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return "session-1";
    },
  });
  const POST = createMailThreadSubjectsPostHandler(dependencies);

  const missing = await POST(request({}));
  const extraField = await POST(request({ subject: "a", threadId: "other" }));
  assert.equal(missing.status, 400);
  assert.equal(extraField.status, 400);
  assert.equal(sessionLookupCount, 0);
});

test("revokes a session that belongs to a different JMAP account", async () => {
  const state = createDependencies({
    getThreadSubjects: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const POST = createMailThreadSubjectsPostHandler(state.dependencies);
  const response = await POST(request({ subject: "Test" }));

  assert.equal(response.status, 401);
  assert.deepEqual(state.revoked, ["session-1"]);
});

test("maps an ambiguous subject to a conflict response", async () => {
  const { dependencies } = createDependencies({
    getThreadSubjects: async () => {
      throw new JmapThreadSubjectAmbiguousError();
    },
  });
  const POST = createMailThreadSubjectsPostHandler(dependencies);
  const response = await POST(request({ subject: "Test" }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "subject_ambiguous" });
});

test("rejects an untrusted origin before reading the body or session", async () => {
  let sessionLookupCount = 0;
  const { dependencies } = createDependencies({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return "session-1";
    },
    isTrustedOrigin: () => false,
  });
  const POST = createMailThreadSubjectsPostHandler(dependencies);
  const response = await POST(request({ subject: "Test" }));

  assert.equal(response.status, 403);
  assert.equal(sessionLookupCount, 0);
});

test("maps an incomplete bounded subject search to an explicit response", async () => {
  const { dependencies } = createDependencies({
    getThreadSubjects: async () => {
      throw new JmapThreadSubjectSearchIncompleteError();
    },
  });
  const POST = createMailThreadSubjectsPostHandler(dependencies);
  const response = await POST(request({ subject: "Test" }));

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "subject_search_incomplete" });
});
