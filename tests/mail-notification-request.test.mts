import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidMailNotificationRequest,
  parseMailNotificationRequest,
} from "../lib/jmap/mail-notification-request.mts";

function post(body: unknown): Request {
  return new Request("https://webmail.example.test/api/mail/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("accepts only a bounded state token or a null baseline", async () => {
  assert.deepEqual(await parseMailNotificationRequest(post({ sinceState: null })), { sinceState: null });
  assert.deepEqual(await parseMailNotificationRequest(post({ sinceState: "state-1" })), { sinceState: "state-1" });
  await assert.rejects(parseMailNotificationRequest(post({ sinceState: "bad\nstate" })), InvalidMailNotificationRequest);
  await assert.rejects(parseMailNotificationRequest(post({ sinceState: "state-1", accountId: "other" })), InvalidMailNotificationRequest);
});

test("rejects an oversized notification request before parsing", async () => {
  const request = new Request("https://webmail.example.test/api/mail/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": "20000",
    },
    body: "{}",
  });
  await assert.rejects(parseMailNotificationRequest(request), InvalidMailNotificationRequest);
});
