import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapThreadSubjectSearchIncompleteError,
} from "../lib/jmap/client.mts";
import {
  createMailThreadSubjectCandidatesPostHandler,
  type MailThreadSubjectCandidatesRouteDependencies,
} from "../lib/jmap/mail-thread-subject-candidates-route.mts";

function request(body: unknown) {
  return new Request("https://webmail.example.test/api/mail/thread-subject-candidates", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://webmail.example.test",
    },
    body: JSON.stringify(body),
  });
}

function createDependencies(
  overrides: Partial<MailThreadSubjectCandidatesRouteDependencies> = {},
) {
  const revoked: string[] = [];
  let receivedQuery: string | null = null;
  const dependencies: MailThreadSubjectCandidatesRouteDependencies = {
    getSessionId: async () => "session-1",
    getAuthenticatedSession: async () => ({
      accessToken: "opaque-test-token",
      accountId: "account-1",
    }),
    revokeSession: async (sessionId) => {
      revoked.push(sessionId);
    },
    getSubjectCandidates: async ({ query }) => {
      receivedQuery = query;
      return {
        queryCandidateCount: 2,
        candidatesDisappearedCount: 0,
        candidateMessagesMissingFromThreadCount: 0,
        candidateThreadsDisappearedCount: 0,
        memberSubjectLookupsIncomplete: false,
        incomplete: false,
        threads: [{
          candidateMessageCount: 2,
          candidateSubjects: ["Fwd: Test Send", "Re: Fwd: Test Send"],
          messageCount: 3,
          memberSubjects: ["Test Send", "Fwd: Test Send", "Re: Fwd: Test Send"],
          threadUnavailable: false,
          truncated: false,
          subjectsTruncated: false,
        }],
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
  return { dependencies, revoked, get receivedQuery() { return receivedQuery; } };
}

test("returns authenticated subject-only thread candidates with no-store headers", async () => {
  const state = createDependencies();
  const POST = createMailThreadSubjectCandidatesPostHandler(state.dependencies);
  const response = await POST(request({ query: "Test Send" }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.equal(state.receivedQuery, "Test Send");
  assert.deepEqual(await response.json(), {
    queryCandidateCount: 2,
    candidatesDisappearedCount: 0,
    candidateMessagesMissingFromThreadCount: 0,
    candidateThreadsDisappearedCount: 0,
    memberSubjectLookupsIncomplete: false,
    incomplete: false,
    threads: [{
      candidateMessageCount: 2,
      candidateSubjects: ["Fwd: Test Send", "Re: Fwd: Test Send"],
      messageCount: 3,
      memberSubjects: ["Test Send", "Fwd: Test Send", "Re: Fwd: Test Send"],
      threadUnavailable: false,
      truncated: false,
      subjectsTruncated: false,
    }],
  });
});

test("rejects invalid candidate requests before session lookup", async () => {
  let sessionLookupCount = 0;
  const { dependencies } = createDependencies({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return "session-1";
    },
  });
  const POST = createMailThreadSubjectCandidatesPostHandler(dependencies);

  const missing = await POST(request({}));
  const extraField = await POST(request({ query: "a", threadId: "other" }));
  assert.equal(missing.status, 400);
  assert.equal(extraField.status, 400);
  assert.equal(sessionLookupCount, 0);
});

test("rejects an untrusted origin before session lookup", async () => {
  let sessionLookupCount = 0;
  const { dependencies } = createDependencies({
    getSessionId: async () => {
      sessionLookupCount += 1;
      return "session-1";
    },
    isTrustedOrigin: () => false,
  });
  const POST = createMailThreadSubjectCandidatesPostHandler(dependencies);
  const response = await POST(request({ query: "Test Send" }));

  assert.equal(response.status, 403);
  assert.equal(sessionLookupCount, 0);
});

test("revokes a session that belongs to a different JMAP account", async () => {
  const state = createDependencies({
    getSubjectCandidates: async () => {
      throw new JmapAccountMismatchError();
    },
  });
  const POST = createMailThreadSubjectCandidatesPostHandler(state.dependencies);
  const response = await POST(request({ query: "Test Send" }));

  assert.equal(response.status, 401);
  assert.deepEqual(state.revoked, ["session-1"]);
});

test("marks a search beyond its thread bound as incomplete", async () => {
  const { dependencies } = createDependencies({
    getSubjectCandidates: async () => {
      throw new JmapThreadSubjectSearchIncompleteError();
    },
  });
  const POST = createMailThreadSubjectCandidatesPostHandler(dependencies);
  const response = await POST(request({ query: "Test Send" }));

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "subject_search_incomplete" });
});
