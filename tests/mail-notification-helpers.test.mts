import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMailNotificationContent,
  parseInboxChangesBody,
} from "../components/mail/notification-helpers.ts";

test("parses valid notification responses with message summaries", () => {
  const parsed = parseInboxChangesBody(
    {
      cacheScope: "scope-1",
      emailState: "state-2",
      newInboxEmailIds: ["m1"],
      newInboxMessages: [
        {
          id: "m1",
          threadId: "t1",
          senderName: "Alice",
          senderEmail: "alice@example.test",
          subject: "Hello",
        },
      ],
      hasMore: false,
      hasInboxChanges: true,
      reset: false,
    },
    "scope-1",
  );
  assert.ok(parsed);
  assert.equal(parsed.newInboxMessages[0]?.subject, "Hello");
});

test("rejects mismatched scope or malformed message summaries", () => {
  assert.equal(
    parseInboxChangesBody(
      {
        cacheScope: "wrong-scope",
        emailState: "state-2",
        newInboxEmailIds: [],
        newInboxMessages: [],
        hasMore: false,
        hasInboxChanges: false,
        reset: false,
      },
      "scope-1",
    ),
    null,
  );

  assert.equal(
    parseInboxChangesBody(
      {
        cacheScope: "scope-1",
        emailState: "state-2",
        newInboxEmailIds: ["m1"],
        newInboxMessages: [{ id: "" }],
        hasMore: false,
        hasInboxChanges: true,
        reset: false,
      },
      "scope-1",
    ),
    null,
  );
});

test("formats a single new message with sender name, subject, and direct target", () => {
  const formatted = formatMailNotificationContent(
    ["m1"],
    [
      {
        id: "m1",
        threadId: "t1",
        senderName: "Alice",
        senderEmail: "alice@example.test",
        subject: "Design review",
      },
    ],
  );
  assert.deepEqual(formatted, {
    title: "Alice",
    body: "Design review",
    tag: "rekad-new-mail-m1",
    target: { emailId: "m1", threadId: "t1" },
  });
});

test("falls back to sender email and (no subject) when fields are blank", () => {
  const formatted = formatMailNotificationContent(
    ["m1"],
    [
      {
        id: "m1",
        threadId: "t1",
        senderName: "   ",
        senderEmail: "alice@example.test",
        subject: "",
      },
    ],
  );
  assert.deepEqual(formatted, {
    title: "alice@example.test",
    body: "(no subject)",
    tag: "rekad-new-mail-m1",
    target: { emailId: "m1", threadId: "t1" },
  });
});

test("formats multi-message batches with latest summary and inbox target", () => {
  const formatted = formatMailNotificationContent(
    ["m1", "m2", "m3"],
    [
      {
        id: "m2",
        threadId: "t2",
        senderName: "Bob",
        senderEmail: "bob@example.test",
        subject: "Invoice",
      },
      {
        id: "m3",
        threadId: "t3",
        senderName: "Carol",
        senderEmail: "carol@example.test",
        subject: "Schedule",
      },
    ],
    12345,
  );
  assert.deepEqual(formatted, {
    title: "3 new messages",
    body: "Carol: Schedule (+2 more)",
    tag: "rekad-new-mail-batch-12345",
    target: null,
  });
});
