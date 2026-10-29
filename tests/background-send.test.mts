import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSendsInFlight,
  sendErrorMessage,
  startBackgroundSend,
  type BackgroundSendCallbacks,
  type BackgroundSendJob,
} from "../components/mail/background-send.ts";

// The sender only needs a window to register its leave-page warning.
Object.assign(globalThis, { window: { addEventListener() {} } });

const job: BackgroundSendJob = {
  attemptKey: "key-1",
  draftId: "draft-1",
  subject: "Hello",
  recipients: ["a@rekad.id", "b@rekad.id", "c@rekad.id"],
  body: { attemptKey: "key-1", draftId: "draft-1" },
};

function stubFetch(responses: Array<{ status: number; body?: unknown } | "network">) {
  const calls: unknown[] = [];
  let index = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    const next = responses[Math.min(index++, responses.length - 1)];
    if (next === "network") throw new TypeError("offline");
    return Response.json(next.body ?? {}, { status: next.status });
  }) as typeof fetch;
  return calls;
}

function run(callbacks: Partial<BackgroundSendCallbacks> = {}): Promise<string> {
  return new Promise((resolve) => {
    startBackgroundSend(
      job,
      {
        onSettled: (outcome) => resolve(outcome),
        onOpenDraft() {},
        onOpenSent() {},
        ...callbacks,
      },
      [1, 1, 1],
    );
  });
}

test("reports success once the server accepts the submission and sends the request unchanged", async () => {
  const calls = stubFetch([{ status: 200, body: { state: "submitted" } }]);
  assert.equal(await run(), "sent");
  assert.deepEqual(calls, [job.body]);
});

test("accepts a submission whose Sent copy is still being updated", async () => {
  stubFetch([{ status: 200, body: { state: "submitted_sent_update_pending" } }]);
  assert.equal(await run(), "sent");
});

test("a definitive rejection is a failure and is never retried", async () => {
  const calls = stubFetch([{ status: 422, body: { state: "rejected", error: "sender_forbidden" } }]);
  assert.equal(await run(), "failed");
  assert.equal(calls.length, 1);
});

test("a request the server refused outright is a failure", async () => {
  for (const status of [400, 401, 403, 413]) {
    const calls = stubFetch([{ status, body: { error: "sign_in_required" } }]);
    assert.equal(await run(), "failed", String(status));
    assert.equal(calls.length, 1);
  }
});

test("a lost connection is rechecked with the same attempt key, then confirmed", async () => {
  const calls = stubFetch([
    "network",
    { status: 202, body: { state: "unknown" } },
    { status: 200, body: { state: "submitted_sent_update_pending" } },
  ]);
  assert.equal(await run(), "sent");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => (call as { attemptKey: string }).attemptKey === "key-1"));
});

test("an outcome that stays unclear is reported as unconfirmed after a bounded number of checks", async () => {
  const calls = stubFetch([{ status: 202, body: { state: "in_progress" } }]);
  assert.equal(await run(), "unconfirmed");
  assert.equal(calls.length, 4);
});

test("a send is counted as in flight until it settles", async () => {
  stubFetch([{ status: 200, body: { state: "submitted" } }]);
  const done = run();
  assert.equal(hasSendsInFlight(), true);
  await done;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(hasSendsInFlight(), false);
});

test("error messages never echo server details", () => {
  assert.equal(sendErrorMessage("db password leaked"), "The message could not be sent.");
  assert.match(sendErrorMessage("sender_forbidden"), /From address/);
});
