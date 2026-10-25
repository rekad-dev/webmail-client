import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidMailAttachmentRequest,
  MAX_MAIL_ATTACHMENT_BYTES,
  MAX_MAIL_ATTACHMENT_TOTAL_BYTES,
  OversizedMailAttachmentRequest,
  parseMailAttachmentUploadRequest,
  parseMailDraftAttachments,
  sanitizeAttachmentName,
} from "../lib/jmap/mail-attachment-request.mts";

test("reads a bounded raw upload and normalizes its media type", async () => {
  const source = new Uint8Array([0, 1, 2, 255]);
  const request = new Request("https://webmail.example.test/upload", {
    method: "POST",
    headers: { "content-type": "Application/PDF; charset=binary" },
    body: source,
  });

  assert.deepEqual(await parseMailAttachmentUploadRequest(request), {
    bytes: source,
    type: "application/pdf",
  });
});

test("rejects a declared upload larger than the Vercel-safe file limit", async () => {
  const request = new Request("https://webmail.example.test/upload", {
    method: "POST",
    headers: { "content-length": String(MAX_MAIL_ATTACHMENT_BYTES + 1) },
  });

  await assert.rejects(
    parseMailAttachmentUploadRequest(request),
    OversizedMailAttachmentRequest,
  );
});

test("enforces the upload limit while streaming when content length is absent", async () => {
  const request = new Request("https://webmail.example.test/upload", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MAIL_ATTACHMENT_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    }),
    // Node requires this for a streamed request body.
    duplex: "half",
  } as RequestInit);

  await assert.rejects(
    parseMailAttachmentUploadRequest(request),
    OversizedMailAttachmentRequest,
  );
});

test("validates draft metadata, permits reused blob IDs, and applies the message cap", () => {
  const attachments = Array.from({ length: 5 }, (_, index) => ({
    blobId: "same-blob",
    name: `file-${index}.bin`,
    type: "application/octet-stream",
    size: MAX_MAIL_ATTACHMENT_BYTES,
  }));

  assert.equal(
    parseMailDraftAttachments(attachments).reduce((sum, item) => sum + item.size, 0),
    MAX_MAIL_ATTACHMENT_TOTAL_BYTES,
  );
  assert.throws(
    () => parseMailDraftAttachments([...attachments, { ...attachments[0]!, name: "extra" }]),
    OversizedMailAttachmentRequest,
  );
  assert.throws(
    () => parseMailDraftAttachments([{ ...attachments[0]!, blobId: "bad\nblob" }]),
    InvalidMailAttachmentRequest,
  );
});

test("sanitizes unsafe path separators and control characters in filenames", () => {
  assert.equal(sanitizeAttachmentName("../report\r\n.pdf"), ".._report.pdf");
  assert.equal(sanitizeAttachmentName("safe\u202Efdp.exe"), "safefdp.exe");
  assert.equal(sanitizeAttachmentName("\\"), "_");
  assert.equal(sanitizeAttachmentName("\0 \t"), "attachment");
});
