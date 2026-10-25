import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfflineMessageRecord,
  MAX_OFFLINE_CACHE_BYTES,
  MAX_OFFLINE_MESSAGE_BYTES,
  MAX_OFFLINE_MESSAGES,
  OfflineCacheLimitError,
  planOfflineCacheSave,
  planOfflineNotificationCommit,
} from "../lib/offline/mail-cache-model.mts";

function content(emailId: string, textBody = "body") {
  return {
    emailId,
    subject: `Subject ${emailId}`,
    senderName: "Sender",
    senderEmail: "sender@example.test",
    receivedAt: "2026-10-25T10:00:00Z",
    textBody,
  };
}

test("offline message save evicts the least recently used record at the count cap", () => {
  let records = [] as ReturnType<typeof createOfflineMessageRecord>[];
  let evicted: string[] = [];
  for (let index = 0; index <= MAX_OFFLINE_MESSAGES; index += 1) {
    const incoming = createOfflineMessageRecord("scope-one", content(`email-${index}`), index + 1);
    const plan = planOfflineCacheSave(records, incoming);
    records = plan.records;
    evicted = [...evicted, ...plan.evictedEmailIds];
  }
  assert.equal(records.length, MAX_OFFLINE_MESSAGES);
  assert.deepEqual(evicted, ["email-0"]);
});

test("offline cache stays within its serialized byte cap and rejects an oversized message", () => {
  let records = [] as ReturnType<typeof createOfflineMessageRecord>[];
  for (let index = 0; index < MAX_OFFLINE_MESSAGES; index += 1) {
    const incoming = createOfflineMessageRecord(
      "scope-one",
      content(`large-${index}`, "x".repeat(300 * 1024)),
      index + 1,
    );
    records = planOfflineCacheSave(records, incoming).records;
  }
  assert.ok(records.length < MAX_OFFLINE_MESSAGES);
  assert.ok(records.reduce((total, record) => total + record.sizeBytes, 0) <= MAX_OFFLINE_CACHE_BYTES);
  assert.throws(
    () => createOfflineMessageRecord("scope-one", content("too-large", "x".repeat(MAX_OFFLINE_MESSAGE_BYTES))),
    OfflineCacheLimitError,
  );
});

test("notification cursor commit deduplicates IDs and rejects stale concurrent tabs", () => {
  const current = {
    cacheScope: "scope-one",
    emailState: "state-1",
    enabled: true,
    notifiedEmailIds: ["already-notified"],
    updatedAt: 1,
  };
  const committed = planOfflineNotificationCommit(
    "scope-one",
    current,
    "state-1",
    "state-2",
    ["already-notified", "new-email", "new-email"],
    2,
  );
  assert.equal(committed.committed, true);
  assert.deepEqual(committed.notifyEmailIds, ["new-email"]);
  assert.equal(committed.state?.enabled, true);
  assert.deepEqual(committed.state?.notifiedEmailIds, ["already-notified", "new-email"]);

  const stale = planOfflineNotificationCommit(
    "scope-one",
    current,
    "other-state",
    "state-3",
    ["another-email"],
    3,
  );
  assert.equal(stale.committed, false);
  assert.deepEqual(stale.notifyEmailIds, []);
});
