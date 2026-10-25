import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapSendRejectedError,
} from "../lib/jmap/client.mts";
import {
  createMailSendPostHandler,
  type MailSendRouteDependencies,
} from "../lib/jmap/mail-send-route.mts";
import type { MailSendAttempt } from "../lib/mail/send-attempt-store.mts";
import { InvalidMailAttachmentReceipt } from "../lib/jmap/mail-attachment-receipt.mts";

const sessionId = randomBytes(32).toString("base64url");
const accessToken = randomBytes(32).toString("base64url");
const attemptKey = randomBytes(32).toString("base64url");

function request(overrides: Record<string, unknown> = {}, origin = "https://webmail.example.test") {
  return new Request("https://webmail.example.test/api/mail/send", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      attemptKey,
      identityId: "identity-1",
      to: ["recipient@example.test"],
      cc: [],
      bcc: [],
      subject: "A subject",
      body: "Plain text body",
      ...overrides,
    }),
  });
}

function cloneAttempt(attempt: MailSendAttempt | null): MailSendAttempt | null {
  return attempt ? { ...attempt, updatedAt: new Date(attempt.updatedAt) } : null;
}

function makeDependencies(
  overrides: Partial<MailSendRouteDependencies> = {},
) {
  let attempt: MailSendAttempt | null = null;
  const calls: string[] = [];
  const revoked: string[] = [];
  const dependencies: MailSendRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken, accountId: "account-1" }),
    revokeSession: async (id) => { revoked.push(id); },
    isTrustedOrigin: (requestValue) =>
      requestValue.headers.get("origin") === new URL(requestValue.url).origin,
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    reserveAttempt: async () => {
      calls.push("reserve");
      if (attempt) return { created: false, attempt: { ...attempt } };
      attempt = {
        state: "reserved",
        emailId: null,
        submissionId: null,
        updatedAt: new Date(),
      };
      return { created: true, attempt: { ...attempt } };
    },
    getAttempt: async () => cloneAttempt(attempt),
    transitionAttempt: async (options) => {
      calls.push(`transition:${options.from}->${options.to}`);
      if (!attempt || attempt.state !== options.from) return null;
      attempt = {
        state: options.to,
        emailId: options.emailId ?? attempt.emailId,
        submissionId: options.submissionId ?? attempt.submissionId,
        updatedAt: new Date(),
      };
      return { ...attempt };
    },
    createDraft: async () => {
      calls.push("createDraft");
      return { emailId: "email-1" };
    },
    submitEmail: async () => {
      calls.push("submitEmail");
      return { submissionId: "submission-1", sentUpdateApplied: true };
    },
    updateSent: async () => {
      calls.push("updateSent");
      return true;
    },
    reconcile: async () => {
      calls.push("reconcile");
      return { submissionId: null, inSentMailbox: false };
    },
    destroyDraft: async () => { calls.push("destroyDraft"); },
    ...overrides,
  };

  if (overrides.reserveAttempt) {
    // Tests supplying an initial row can replace the default in-memory store.
    const originalGetAttempt = dependencies.getAttempt;
    void originalGetAttempt;
  }

  return {
    dependencies,
    calls,
    revoked,
    setAttempt(value: MailSendAttempt | null) { attempt = value; },
    getAttempt() { return cloneAttempt(attempt); },
    handler: createMailSendPostHandler(dependencies),
  };
}

test("rejects cross-origin POST before session or send attempt work", async () => {
  let sessionCalls = 0;
  const { handler } = makeDependencies({
    getSessionId: async () => {
      sessionCalls += 1;
      return sessionId;
    },
  });
  const response = await handler(request({}, "https://attacker.example"));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(sessionCalls, 0);
});

test("rejects unsigned attachment blob references before any submission", async () => {
  const { handler, calls, getAttempt } = makeDependencies({
    createDraft: async () => {
      calls.push("createDraft");
      throw new InvalidMailAttachmentReceipt();
    },
  });
  const response = await handler(request({
    attachments: [{
      blobId: "client-chosen-blob",
      name: "notes.txt",
      type: "text/plain",
      size: 0,
    }],
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
  assert.equal(getAttempt()?.state, "rejected");
  assert.equal(calls.includes("submitEmail"), false);
});

test("submits through JMAP once and returns only the accepted state", async () => {
  const { handler, calls, getAttempt } = makeDependencies();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: "submitted" });
  assert.deepEqual(calls.slice(0, 5), [
    "reserve",
    "createDraft",
    "transition:reserved->draft_created",
    "transition:draft_created->submitting",
    "submitEmail",
  ]);
  assert.equal(getAttempt()?.state, "submitted");
  assert.equal(getAttempt()?.emailId, "email-1");
  assert.equal(getAttempt()?.submissionId, "submission-1");

  const second = await handler(request());
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { state: "submitted" });
  assert.equal(calls.filter((call) => call === "submitEmail").length, 1);
});

test("leaves transport-ambiguous attempts unknown and never resubmits the same key", async () => {
  const { handler, calls, getAttempt } = makeDependencies({
    submitEmail: async () => {
      calls.push("submitEmail");
      throw new Error("transport response lost");
    },
  });

  const first = await handler(request());
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), { state: "unknown" });
  assert.equal(getAttempt()?.state, "unknown");

  const second = await handler(request());
  assert.equal(second.status, 202);
  assert.deepEqual(await second.json(), { state: "unknown" });
  assert.equal(calls.filter((call) => call === "submitEmail").length, 1);
  assert.equal(calls.filter((call) => call === "reconcile").length, 1);
});

test("a proven submission retries only its idempotent Sent update", async () => {
  const { handler, calls, setAttempt, getAttempt } = makeDependencies({
    reconcile: async () => {
      calls.push("reconcile");
      return { submissionId: "submission-1", inSentMailbox: false };
    },
    updateSent: async () => {
      calls.push("updateSent");
      return true;
    },
  });
  setAttempt({
    state: "unknown",
    emailId: "email-1",
    submissionId: null,
    updatedAt: new Date(Date.now() - 120_000),
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: "submitted" });
  assert.equal(getAttempt()?.state, "submitted");
  assert.equal(calls.includes("submitEmail"), false);

  setAttempt({
    state: "submitted_sent_update_pending",
    emailId: "email-1",
    submissionId: "submission-1",
    updatedAt: new Date(),
  });
  const retry = await handler(request());
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { state: "submitted" });
  assert.equal(calls.includes("submitEmail"), false);
});

test("a definitive Stalwart rejection preserves the compose data and removes the temporary draft", async () => {
  const { handler, calls, getAttempt } = makeDependencies({
    submitEmail: async () => {
      calls.push("submitEmail");
      throw new JmapSendRejectedError("send_forbidden");
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    state: "rejected",
    error: "send_forbidden",
  });
  assert.equal(getAttempt()?.state, "rejected");
  assert.ok(calls.includes("destroyDraft"));
});

test("revokes the session on account mismatch before sending", async () => {
  const { handler, revoked, calls } = makeDependencies({
    createDraft: async () => {
      calls.push("createDraft");
      throw new JmapAccountMismatchError();
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
  assert.deepEqual(revoked, [sessionId]);
  assert.equal(calls.includes("submitEmail"), false);
});
