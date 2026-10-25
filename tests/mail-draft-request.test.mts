import assert from "node:assert/strict";
import test from "node:test";

import {
  OversizedMailDraftRequest,
  parseMailDraftRequest,
} from "../lib/jmap/mail-draft-request.mts";

function request(body: unknown): Request {
  return new Request("https://webmail.example.test/api/mail/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("maps attachment aggregate overflow to an oversized draft request", async () => {
  const attachments = Array.from({ length: 6 }, (_, index) => ({
    blobId: `blob-${index}`,
    name: `file-${index}.bin`,
    type: "application/octet-stream",
    size: 4 * 1024 * 1024,
  }));

  await assert.rejects(
    parseMailDraftRequest(request({
      identityId: "identity-1",
      to: [],
      cc: [],
      bcc: [],
      subject: "Draft",
      body: "Body",
      attachments,
    })),
    OversizedMailDraftRequest,
  );
});
