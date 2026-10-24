import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapThreadSubjectsNotFoundError,
  JmapThreadSubjectSearchIncompleteError,
  runJmapOAuthThreadSubjects,
  runJmapOAuthThreadSubjectCandidates,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const TARGET_SUBJECT = "Fwd: Test Send";

function responseJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createFetch(options: {
  maxObjectsInGet?: number;
  memberIds?: string[];
  omitMemberResult?: boolean;
  omitSubjectProperty?: boolean;
  malformedThreadCoverage?: boolean;
  candidateSubject?: string;
  candidateSubjects?: Record<string, string | null>;
  candidateThreadIds?: Record<string, string>;
  longMemberSubject?: string;
  queryTotal?: number;
  queryIds?: string[];
  missingCandidate?: boolean;
  threadMissing?: boolean;
  missingThreadIds?: string[];
  threadMemberIds?: string[];
  threadMemberIdsByThread?: Record<string, string[]>;
  missingMemberIds?: string[];
} = {}) {
  const memberIds = options.memberIds ?? ["email-1", "email-2"];
  const targetId = memberIds.at(-1) ?? "email-2";
  const queryIds = options.queryIds ?? [targetId];
  const candidateSubjectFor = (id: string): string | null => {
    if (options.candidateSubjects && Object.hasOwn(options.candidateSubjects, id)) {
      return options.candidateSubjects[id] ?? null;
    }
    return id === targetId
      ? options.candidateSubject ?? TARGET_SUBJECT
      : `Subject ${id}`;
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
      return responseJson({
        capabilities: { [CORE]: { maxObjectsInGet: options.maxObjectsInGet ?? 1 }, [MAIL]: {} },
        accounts: { "account-1": { accountCapabilities: { [MAIL]: {} } } },
        primaryAccounts: { [MAIL]: "account-1" },
        apiUrl: `${ORIGIN}/jmap/`,
        uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
        downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
      });
    }
    if (url.pathname !== "/jmap/") {
      throw new Error("Unexpected JMAP request target");
    }

    const request = JSON.parse(String(init.body));
    const [method, args, callId] = request.methodCalls[0];
    if (method === "Email/query") {
      return responseJson({
        methodResponses: [[
          "Email/query",
          { ids: queryIds, total: options.queryTotal ?? queryIds.length },
          callId,
        ]],
      });
    }
    if (method === "Thread/get") {
      const requestedThreadIds = args.ids as string[];
      const missingThreadIds = new Set(
        options.missingThreadIds ?? (options.threadMissing ? ["thread-1"] : []),
      );
      return responseJson({
        methodResponses: [[
          "Thread/get",
          {
            list: options.malformedThreadCoverage
              ? []
              : requestedThreadIds.filter((id) => !missingThreadIds.has(id)).map((id) => ({
                id,
                emailIds: options.threadMemberIdsByThread?.[id] ??
                  options.threadMemberIds ?? memberIds,
              })),
            notFound: [...missingThreadIds].filter((id) => requestedThreadIds.includes(id)),
          },
          callId,
        ]],
      });
    }
    assert.equal(method, "Email/get");
    const list = callId === "phase5-thread-subject-lookup-get"
      ? options.missingCandidate
        ? []
        : args.ids.map((id: string) => options.omitSubjectProperty
          ? { id, threadId: options.candidateThreadIds?.[id] ?? "thread-1" }
          : {
            id,
            threadId: options.candidateThreadIds?.[id] ?? "thread-1",
            subject: candidateSubjectFor(id),
          })
      : options.omitMemberResult
        ? []
        : args.ids.filter((id: string) =>
          callId !== "phase5-thread-subjects-email-get" ||
          !options.missingMemberIds?.includes(id),
        ).map((id: string) => ({
          id,
          ...(options.omitSubjectProperty
            ? {}
            : {
              subject: options.candidateSubjects && Object.hasOwn(options.candidateSubjects, id)
                ? options.candidateSubjects[id] ?? null
                : id === targetId
                  ? options.candidateSubject ?? TARGET_SUBJECT
                  : options.longMemberSubject ?? `Subject ${id}`,
            }),
        }));
    const notFound = callId === "phase5-thread-subject-lookup-get" && options.missingCandidate
      ? [targetId]
      : callId === "phase5-thread-subjects-email-get"
        ? (options.missingMemberIds ?? []).filter((id) => (args.ids as string[]).includes(id))
        : [];
    return responseJson({
      methodResponses: [["Email/get", { list, notFound }, callId]],
    });
  };
  return { fetchImpl, calls, memberIds, targetId };
}

function emailGetCalls(calls: Array<{ url: URL; init: RequestInit }>) {
  return calls.flatMap((call) => {
    if (call.url.pathname !== "/jmap/") return [];
    const request = JSON.parse(String(call.init.body));
    return request.methodCalls.flatMap((methodCall: unknown[]) =>
      methodCall[0] === "Email/get" ? [methodCall] : [],
    );
  });
}

test("searches by subject and fetches only conversation member IDs and subjects", async () => {
  const { fetchImpl, calls } = createFetch();
  const accessToken = randomBytes(32).toString("base64url");
  const result = await runJmapOAuthThreadSubjects({
    accessToken,
    expectedAccountId: "account-1",
    subject: TARGET_SUBJECT,
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.deepEqual(result, {
    threadId: "thread-1",
    messageCount: 2,
    members: [
      { id: "email-1", subject: "Subject email-1" },
      { id: "email-2", subject: TARGET_SUBJECT },
    ],
    truncated: false,
    subjectsTruncated: false,
  });

  const queryCall = calls
    .filter((call) => call.url.pathname === "/jmap/")
    .flatMap((call) => JSON.parse(String(call.init.body)).methodCalls)
    .find((methodCall: unknown[]) => methodCall[0] === "Email/query");
  assert.deepEqual(queryCall[1].filter, { subject: TARGET_SUBJECT });
  assert.equal(queryCall[1].collapseThreads, false);
  assert.equal(queryCall[1].limit, 2);

  const gets = emailGetCalls(calls);
  assert.equal(gets.length, 3);
  assert.deepEqual(gets[0][1].properties, ["id", "threadId", "subject"]);
  for (const methodCall of gets.slice(1)) {
    assert.deepEqual(methodCall[1].properties, ["id", "subject"]);
  }
  const requestJson = calls
    .filter((call) => call.url.pathname === "/jmap/")
    .map((call) => JSON.parse(String(call.init.body)));
  assert.equal(JSON.stringify(requestJson).includes("preview"), false);
  assert.equal(JSON.stringify(requestJson).includes("bodyValues"), false);
  assert.equal(JSON.stringify(requestJson).includes("textBody"), false);
  assert.equal(JSON.stringify(requestJson).includes("htmlBody"), false);
  for (const call of calls.filter((item) => item.url.pathname === "/jmap/")) {
    assert.equal(
      new Headers(call.init.headers).get("authorization"),
      `Bearer ${accessToken}`,
    );
  }
});

test("returns bounded subject-only candidate thread metadata", async () => {
  const { fetchImpl, calls } = createFetch({
    queryIds: ["email-1", "email-2"],
    candidateSubjects: {
      "email-1": "Fwd: Test Send",
      "email-2": "Re: Fwd: Test Send",
    },
  });
  const result = await runJmapOAuthThreadSubjectCandidates({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    query: "Test Send",
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.deepEqual(result, {
    queryCandidateCount: 2,
    candidatesDisappearedCount: 0,
    candidateMessagesMissingFromThreadCount: 0,
    candidateThreadsDisappearedCount: 0,
    memberSubjectLookupsIncomplete: false,
    incomplete: false,
    threads: [{
      candidateMessageCount: 2,
      candidateSubjects: ["Fwd: Test Send", "Re: Fwd: Test Send"],
      messageCount: 2,
      memberSubjects: ["Fwd: Test Send", "Re: Fwd: Test Send"],
      threadUnavailable: false,
      truncated: false,
      subjectsTruncated: false,
    }],
  });

  const requestJson = calls
    .filter((call) => call.url.pathname === "/jmap/")
    .map((call) => JSON.parse(String(call.init.body)));
  const queryCall = requestJson
    .flatMap((request) => request.methodCalls)
    .find((methodCall: unknown[]) => methodCall[0] === "Email/query");
  assert.deepEqual(queryCall[1].filter, { subject: "Test Send" });
  assert.equal(JSON.stringify(requestJson).includes("preview"), false);
  assert.equal(JSON.stringify(requestJson).includes("bodyValues"), false);
  assert.equal(JSON.stringify(requestJson).includes("textBody"), false);
  assert.equal(JSON.stringify(requestJson).includes("htmlBody"), false);
  for (const methodCall of requestJson.flatMap((request) => request.methodCalls)) {
    if (methodCall[0] === "Email/get") {
      assert.ok(methodCall[1].properties.every((property: string) =>
        ["id", "threadId", "subject"].includes(property),
      ));
    }
  }
});

test("keeps available subject metadata when another candidate thread disappears", async () => {
  const { fetchImpl } = createFetch({
    queryIds: ["email-1", "email-2"],
    candidateSubjects: {
      "email-1": "Fwd: Test Send",
      "email-2": "Re: Fwd: Test Send",
    },
    candidateThreadIds: {
      "email-1": "thread-1",
      "email-2": "thread-2",
    },
    missingThreadIds: ["thread-2"],
    threadMemberIdsByThread: { "thread-1": ["email-1"] },
  });
  const result = await runJmapOAuthThreadSubjectCandidates({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    query: "Test Send",
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.queryCandidateCount, 2);
  assert.equal(result.candidateThreadsDisappearedCount, 1);
  assert.equal(result.incomplete, true);
  assert.equal(result.threads.length, 2);
  assert.deepEqual(result.threads[0], {
    candidateMessageCount: 1,
    candidateSubjects: ["Fwd: Test Send"],
    messageCount: 1,
    memberSubjects: ["Fwd: Test Send"],
    threadUnavailable: false,
    truncated: false,
    subjectsTruncated: false,
  });
  assert.deepEqual(result.threads[1], {
    candidateMessageCount: 1,
    candidateSubjects: ["Re: Fwd: Test Send"],
    messageCount: null,
    memberSubjects: [],
    threadUnavailable: true,
    truncated: true,
    subjectsTruncated: false,
  });
});

test("applies one global member-subject lookup budget and marks truncation", async () => {
  const { fetchImpl, calls } = createFetch({
    memberIds: ["email-1", "email-2", "email-3"],
    queryIds: ["email-2"],
    candidateSubject: "Re: Fwd: Test Send",
  });
  const result = await runJmapOAuthThreadSubjectCandidates({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    query: "Test Send",
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.threads[0]?.messageCount, 3);
  assert.equal(result.threads[0]?.truncated, true);
  assert.equal(result.memberSubjectLookupsIncomplete, true);
  assert.equal(result.incomplete, true);
  const memberGets = emailGetCalls(calls).filter(
    (methodCall) => methodCall[2] === "phase5-thread-subjects-email-get",
  );
  assert.equal(memberGets.length, 2);
});

test("marks a disappeared member subject as an incomplete candidate result", async () => {
  const { fetchImpl } = createFetch({ missingMemberIds: ["email-2"] });
  const result = await runJmapOAuthThreadSubjectCandidates({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    query: "Test Send",
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.memberSubjectLookupsIncomplete, true);
  assert.equal(result.incomplete, true);
  assert.equal(result.threads[0]?.truncated, true);
  assert.deepEqual(result.threads[0]?.memberSubjects, ["Subject email-1"]);
});

test("rejects a primary account mismatch before querying subjects", async () => {
  const { fetchImpl, calls } = createFetch();
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "different-account",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    JmapAccountMismatchError,
  );
  assert.equal(calls.some((call) => call.url.pathname === "/jmap/"), false);
});

test("bounds member retrieval and marks an incomplete thread result", async () => {
  const { fetchImpl, calls, memberIds, targetId } = createFetch({
    memberIds: ["email-1", "email-2", "email-3", "email-4", "email-5"],
  });
  const result = await runJmapOAuthThreadSubjects({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    subject: TARGET_SUBJECT,
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.truncated, true);
  assert.equal(result.messageCount, 5);
  assert.equal(result.subjectsTruncated, false);
  assert.equal(result.members.length, 2);
  assert.equal(result.members.some((member) => member.id === targetId), true);
  assert.equal(emailGetCalls(calls).length, 3);
  assert.equal(memberIds.length, 5);
});

test("rejects a thread response that omits a requested ID without notFound", async () => {
  const { fetchImpl } = createFetch({ malformedThreadCoverage: true });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    /omitted a thread result/,
  );
});

test("rejects an Email/get response that omits a requested member without notFound", async () => {
  const { fetchImpl } = createFetch({ omitMemberResult: true });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    /omitted thread subject metadata/,
  );
});

test("rejects a requested subject property that is omitted from Email/get", async () => {
  const { fetchImpl } = createFetch({ omitSubjectProperty: true });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    /invalid subject search metadata/,
  );
});

test("does not treat a longer subject as an exact match after the input limit", async () => {
  const requestedSubject = "x".repeat(512);
  const { fetchImpl } = createFetch({
    candidateSubject: `${requestedSubject} extra`,
  });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: requestedSubject,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "subject_mismatch",
  );
});

test("bounds member subjects in the response without affecting exact candidate matching", async () => {
  const longMemberSubject = "x".repeat(2048);
  const { fetchImpl } = createFetch({ longMemberSubject });
  const result = await runJmapOAuthThreadSubjects({
    accessToken: randomBytes(32).toString("base64url"),
    expectedAccountId: "account-1",
    subject: TARGET_SUBJECT,
    sessionUrl: `${ORIGIN}/.well-known/jmap`,
    fetchImpl,
  });

  assert.equal(result.members[0]?.subject, longMemberSubject.slice(0, 512));
  assert.equal(result.members[0]?.subject?.length, 512);
  assert.equal(result.members.at(-1)?.subject, TARGET_SUBJECT);
  assert.equal(result.subjectsTruncated, true);
  assert.equal(result.messageCount, 2);
});

test("reports whether the subject query produced any candidates", async () => {
  const { fetchImpl } = createFetch({ queryIds: [], queryTotal: 0 });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "subject_query_empty" &&
      error.queryCandidateCount === 0,
  );
});

test("reports candidates whose stored subjects do not exactly match the request", async () => {
  const { fetchImpl } = createFetch({ candidateSubject: "Re: Fwd: Test Send" });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "subject_mismatch" &&
      error.queryCandidateCount === 1 &&
      error.exactSubjectMatchCount === 0,
  );
});

test("reports when all subject-query candidates disappear before Email/get", async () => {
  const { fetchImpl } = createFetch({ missingCandidate: true });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "candidate_messages_disappeared" &&
      error.queryCandidateCount === 1 &&
      error.exactSubjectMatchCount === 0,
  );
});

test("distinguishes a missing thread from a missing subject-query match", async () => {
  const { fetchImpl } = createFetch({ threadMissing: true });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "thread_not_found" &&
      error.exactSubjectMatchCount === 1,
  );
});

test("reports when an exact subject email is absent from its returned thread", async () => {
  const { fetchImpl } = createFetch({ threadMemberIds: ["email-1"] });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "matched_email_not_member",
  );
});

test("reports when the exact subject email disappears during member lookup", async () => {
  const { fetchImpl, targetId } = createFetch({ missingMemberIds: ["email-2"] });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    (error) =>
      error instanceof JmapThreadSubjectsNotFoundError &&
      error.reason === "matched_email_disappeared" &&
      targetId === "email-2",
  );
});

test("reports a bounded but incomplete subject query without claiming ambiguity", async () => {
  const { fetchImpl } = createFetch({ queryTotal: 3 });
  await assert.rejects(
    runJmapOAuthThreadSubjects({
      accessToken: randomBytes(32).toString("base64url"),
      expectedAccountId: "account-1",
      subject: TARGET_SUBJECT,
      sessionUrl: `${ORIGIN}/.well-known/jmap`,
      fetchImpl,
    }),
    JmapThreadSubjectSearchIncompleteError,
  );
});
