import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapThreadSubjectAmbiguousError,
} from "../lib/jmap/client.mts";
import {
  createMailThreadSubjectsGetHandler,
  type MailThreadSubjectsRouteDependencies,
} from "../lib/jmap/mail-thread-subjects-route.mts";

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
    ...overrides,
  };
  return { dependencies, revoked, get receivedSubject() { return receivedSubject; } };
}

test("returns only the authenticated thread subject metadata with no-store headers", async () => {
  const state = createDependencies();
  const GET = createMailThreadSubjectsGetHandler(state.dependencies);
  const response = await GET(
    new Request("https://webmail.example.test/api/mail/thread-subjects?subject=Fwd%3A%20Test%20Send"),
  );

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

test("rejects missing or duplicated subjects before session lookup", async () => {
  let sessionLookupCount = 0;
  const { dependencies } = createDependencies({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return "session-1";
    },
  });
  const GET = createMailThreadSubjectsGetHandler(dependencies);

  const missing = await GET(new Request("https://webmail.example.test/api/mail/thread-subjects"));
  const duplicated = await GET(
    new Request("https://webmail.example.test/api/mail/thread-subjects?subject=a&subject=b"),
  );
  assert.equal(missing.status, 400);
  assert.equal(duplicated.status, 400);
  assert.equal(sessionLookupCount, 0);
});

test("revokes a session that belongs to a different JMAP account", async () => {
  const state = createDependencies({
    getThreadSubjects: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const GET = createMailThreadSubjectsGetHandler(state.dependencies);
  const response = await GET(
    new Request("https://webmail.example.test/api/mail/thread-subjects?subject=Test"),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(state.revoked, ["session-1"]);
});

test("maps an ambiguous subject to a conflict response", async () => {
  const { dependencies } = createDependencies({
    getThreadSubjects: async () => {
      throw new JmapThreadSubjectAmbiguousError();
    },
  });
  const GET = createMailThreadSubjectsGetHandler(dependencies);
  const response = await GET(
    new Request("https://webmail.example.test/api/mail/thread-subjects?subject=Test"),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "subject_ambiguous" });
});
