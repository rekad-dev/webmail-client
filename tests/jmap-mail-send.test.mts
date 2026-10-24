import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapSendRejectedError,
  runJmapOAuthCreateDraft,
  runJmapOAuthReconcileSend,
  runJmapOAuthSubmitEmail,
  runJmapOAuthUpdateSent,
  type JmapMailSendInput,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const SUBMISSION = "urn:ietf:params:jmap:submission";
const TEST_ORIGIN = "https://mail.example.test";
const token = randomBytes(32).toString("base64url");
const sendAttemptKey = Buffer.alloc(32).toString("base64url");
const sendMarker = `rekad-send-pending-${createHash("sha256")
  .update("rekad-mail-draft-send-lock\0")
  .update(sendAttemptKey)
  .digest("hex")}`;

const input: JmapMailSendInput = {
  identityId: "identity-1",
  to: [{ name: null, email: "to@example.test" }],
  cc: [{ name: null, email: "cc@example.test" }],
  bcc: [{ name: null, email: "archive@example.test" }],
  subject: "A subject",
  body: "Plain text body\nSecond line",
};

function session(): Record<string, unknown> {
  return {
    capabilities: { [CORE]: {}, [MAIL]: {}, [SUBMISSION]: {} },
    accounts: {
      "account-1": {
        accountCapabilities: {
          [MAIL]: {},
          [SUBMISSION]: { maxDelayedSend: 0 },
        },
      },
    },
    primaryAccounts: { [MAIL]: "account-1" },
    apiUrl: `${TEST_ORIGIN}/jmap/`,
    uploadUrl: `${TEST_ORIGIN}/jmap/upload/{accountId}/`,
    downloadUrl: `${TEST_ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
  };
}

function makeFetch(options: {
  identityEmail?: string;
  omitIdentity?: boolean;
  submissionIds?: string[];
  inSentMailbox?: boolean;
  rejectSubmission?: boolean;
} = {}) {
  const apiRequests: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (inputValue, init) => {
    const url = new URL(inputValue instanceof Request ? inputValue.url : inputValue.toString());
    if (url.pathname === "/.well-known/jmap") {
      return Response.json(session());
    }
    if (url.pathname !== "/jmap/") throw new Error("Unexpected JMAP request");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    apiRequests.push(requestBody);
    const calls = requestBody.methodCalls as unknown[][];
    const responses = calls.map(([method, args, callId]) => {
      if (method === "Mailbox/get") {
        return [
          "Mailbox/get",
          { list: [
            { id: "drafts-1", name: "Drafts", role: "drafts" },
            { id: "sent-1", name: "Sent", role: "sent" },
          ] },
          callId,
        ];
      }
      if (method === "Identity/get") {
        return [
          "Identity/get",
          { list: options.omitIdentity ? [] : [{
            id: "identity-1",
            name: "Sender Name",
            email: options.identityEmail ?? "sender@example.test",
            replyTo: [{ name: null, email: "reply@example.test" }],
            bcc: [{ name: null, email: "archive@example.test" }],
            textSignature: "— Sender",
          }] },
          callId,
        ];
      }
      if (method === "Email/set") {
        if (args && typeof args === "object" && "create" in args) {
          return ["Email/set", { created: { draft: { id: "email-1" } } }, callId];
        }
        return ["Email/set", { updated: { "email-1": null } }, callId];
      }
      if (method === "EmailSubmission/set") {
        return options.rejectSubmission
          ? ["EmailSubmission/set", {
              notCreated: { submission: { type: "forbiddenToSend" } },
            }, callId]
          : ["EmailSubmission/set", {
              created: { submission: { id: "submission-1" } },
            }, callId];
      }
      if (method === "EmailSubmission/query") {
        return [
          "EmailSubmission/query",
          { ids: options.submissionIds ?? [], total: (options.submissionIds ?? []).length },
          callId,
        ];
      }
      if (method === "Email/get") {
        return [
          "Email/get",
          {
            state: "email-state-1",
            list: [{
              id: "email-1",
              mailboxIds: options.inSentMailbox ? { "sent-1": true } : { "drafts-1": true },
              keywords: { $draft: true },
            }],
            notFound: [],
          },
          callId,
        ];
      }
      throw new Error(`Unexpected JMAP method ${String(method)}`);
    });
    const methodResponses = responses.flatMap((response, index) => {
      if (calls[index][0] === "EmailSubmission/set" && !options.rejectSubmission) {
        return [
          response,
          ["Email/set", { updated: { "email-1": null } }, calls[index][2]],
        ];
      }
      return [response];
    });
    return Response.json({ methodResponses });
  };
  return { fetchImpl, apiRequests };
}

const options = (fetchImpl: typeof fetch) => ({
  accessToken: token,
  expectedAccountId: "account-1",
  sessionUrl: `${TEST_ORIGIN}/.well-known/jmap`,
  fetchImpl,
});

test("creates a server-authorized plain-text draft with identity defaults", async () => {
  const { fetchImpl, apiRequests } = makeFetch();
  const result = await runJmapOAuthCreateDraft({
    ...options(fetchImpl),
    input: {
      ...input,
      bcc: [
        { name: null, email: "archive@example.test" },
        { name: null, email: "private@example.test" },
      ],
    },
  });
  assert.deepEqual(result, { emailId: "email-1" });

  const createRequest = apiRequests[2];
  const call = (createRequest.methodCalls as unknown[][])[0];
  assert.equal(call[0], "Email/set");
  const args = call[1] as Record<string, unknown>;
  const draft = (args.create as Record<string, Record<string, unknown>>).draft;
  assert.deepEqual(draft.from, [{ name: "Sender Name", email: "sender@example.test" }]);
  assert.deepEqual(draft.to, input.to);
  assert.deepEqual(draft.cc, input.cc);
  assert.deepEqual(draft.bcc, [
    { name: null, email: "archive@example.test" },
    { name: null, email: "private@example.test" },
  ]);
  assert.deepEqual(draft.replyTo, [{ name: null, email: "reply@example.test" }]);
  assert.deepEqual(draft.mailboxIds, { "drafts-1": true });
  assert.deepEqual(draft.keywords, { $draft: true });
  assert.deepEqual(draft.bodyStructure, { type: "text/plain", partId: "rekad-text-body" });
  assert.deepEqual(draft.bodyValues, { "rekad-text-body": { value: input.body } });
  assert.equal("htmlBody" in draft, false);
});

test("requires a concrete address covered by a wildcard server identity", async () => {
  const { fetchImpl, apiRequests } = makeFetch({ identityEmail: "*@example.test" });
  const valid = await runJmapOAuthCreateDraft({
    ...options(fetchImpl),
    input: { ...input, fromEmail: "alias@example.test" },
  });
  assert.deepEqual(valid, { emailId: "email-1" });
  const create = apiRequests[2].methodCalls as unknown[][];
  const draft = ((create[0][1] as Record<string, unknown>).create as Record<string, Record<string, unknown>>).draft;
  assert.deepEqual(draft.from, [{ name: "Sender Name", email: "alias@example.test" }]);

  const mismatch = makeFetch({ identityEmail: "*@example.test" });
  await assert.rejects(
    runJmapOAuthCreateDraft({
      ...options(mismatch.fetchImpl),
      input: { ...input, fromEmail: "alias@other.test" },
    }),
    (error: unknown) => error instanceof JmapSendRejectedError && error.reason === "identity_invalid",
  );
  assert.equal(mismatch.apiRequests.length, 2);
});

test("submits with the existing identity and atomically updates Drafts to Sent", async () => {
  const { fetchImpl, apiRequests } = makeFetch();
  const result = await runJmapOAuthSubmitEmail({
    ...options(fetchImpl),
    identityId: "identity-1",
    emailId: "email-1",
    attemptKey: sendAttemptKey,
  });
  assert.deepEqual(result, { submissionId: "submission-1", sentUpdateApplied: true });

  const submissionRequest = apiRequests.at(-1)!;
  assert.deepEqual(submissionRequest.using, [CORE, MAIL, SUBMISSION]);
  const [method, argsValue] = (submissionRequest.methodCalls as unknown[][])[0];
  assert.equal(method, "EmailSubmission/set");
  const args = argsValue as Record<string, unknown>;
  const create = (args.create as Record<string, Record<string, unknown>>).submission;
  assert.deepEqual(create, { identityId: "identity-1", emailId: "email-1" });
  assert.equal("envelope" in create, false);
  assert.deepEqual(args.onSuccessUpdateEmail, {
    "#submission": {
      "mailboxIds/drafts-1": null,
      "mailboxIds/sent-1": true,
      "keywords/$draft": null,
      // The per-attempt send marker is cleared atomically with the mailbox move.
      [`keywords/${sendMarker}`]: null,
    },
  });
});

test("maps an explicit JMAP submission rejection to a stable reason", async () => {
  const { fetchImpl } = makeFetch({ rejectSubmission: true });
  await assert.rejects(
    runJmapOAuthSubmitEmail({
      ...options(fetchImpl),
      identityId: "identity-1",
      emailId: "email-1",
      attemptKey: sendAttemptKey,
    }),
    (error: unknown) => error instanceof JmapSendRejectedError && error.reason === "send_forbidden",
  );
});

test("rejects a sender identity that disappears before JMAP submission", async () => {
  const { fetchImpl, apiRequests } = makeFetch({ omitIdentity: true });
  await assert.rejects(
    runJmapOAuthSubmitEmail({
      ...options(fetchImpl),
      identityId: "identity-1",
      emailId: "email-1",
      attemptKey: sendAttemptKey,
    }),
    (error: unknown) => error instanceof JmapSendRejectedError && error.reason === "identity_invalid",
  );
  assert.equal(
    apiRequests.some((request) =>
      (request.methodCalls as unknown[][]).some((call) => call[0] === "EmailSubmission/set"),
    ),
    false,
  );
});

test("reconciles by JMAP submission ID and Sent membership without sending", async () => {
  const { fetchImpl, apiRequests } = makeFetch({
    submissionIds: ["submission-1"],
    inSentMailbox: true,
  });
  const result = await runJmapOAuthReconcileSend({
    ...options(fetchImpl),
    emailId: "email-1",
  });
  assert.deepEqual(result, { submissionId: "submission-1", inSentMailbox: true });
  const request = apiRequests.at(-1)!;
  assert.deepEqual((request.methodCalls as unknown[][]).map((call) => call[0]), [
    "EmailSubmission/query",
    "Email/get",
  ]);
  assert.deepEqual(((request.methodCalls as unknown[][])[0][1] as Record<string, unknown>).filter, {
    emailIds: ["email-1"],
  });
  assert.deepEqual(((request.methodCalls as unknown[][])[1][1] as Record<string, unknown>).properties, [
    "id",
    "mailboxIds",
  ]);
});

test("retries the Sent update as an idempotent Email/set operation", async () => {
  const { fetchImpl, apiRequests } = makeFetch();
  assert.equal(await runJmapOAuthUpdateSent({ ...options(fetchImpl), emailId: "email-1" }), true);
  const request = apiRequests.at(-1)!;
  const [method, argsValue] = (request.methodCalls as unknown[][]).at(-1)!;
  assert.equal(method, "Email/set");
  const args = argsValue as Record<string, unknown>;
  assert.deepEqual(args.update, {
    "email-1": {
      "mailboxIds/drafts-1": null,
      "mailboxIds/sent-1": true,
      "keywords/$draft": null,
    },
  });
});
