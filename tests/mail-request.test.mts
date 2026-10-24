import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidMailListingRequest,
  parseMailListingRequest,
} from "../lib/jmap/mail-request.mts";

test("defaults to the authenticated inbox and first page", () => {
  assert.deepEqual(parseMailListingRequest(new URLSearchParams()), {
    position: 0,
  });
});

test("parses a bounded page and optional mailbox ID", () => {
  assert.deepEqual(
    parseMailListingRequest(
      new URLSearchParams("mailboxId=inbox-id&position=50"),
    ),
    { mailboxId: "inbox-id", position: 50 },
  );
});

for (const [description, query] of [
  ["negative position", "position=-25"],
  ["fractional position", "position=2.5"],
  ["unaligned position", "position=1"],
  ["position over maximum", "position=1000025"],
  ["duplicated position", "position=0&position=25"],
  ["empty mailbox", "mailboxId="],
  ["duplicated mailbox", "mailboxId=a&mailboxId=b"],
] as const) {
  test(`rejects ${description}`, () => {
    assert.throws(
      () => parseMailListingRequest(new URLSearchParams(query)),
      InvalidMailListingRequest,
    );
  });
}
