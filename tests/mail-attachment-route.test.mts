import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
} from "../lib/jmap/client.mts";
import {
  createMailAttachmentDownloadHandler,
  type MailAttachmentDownloadDependencies,
} from "../lib/jmap/mail-attachment-download-route.mts";
import {
  createMailAttachmentUploadHandler,
  type MailAttachmentUploadDependencies,
} from "../lib/jmap/mail-attachment-upload-route.mts";
import { MAX_MAIL_ATTACHMENT_BYTES } from "../lib/jmap/mail-attachment-request.mts";
import { createMailAttachmentReceipt } from "../lib/jmap/mail-attachment-receipt.mts";

const accessToken = randomBytes(32).toString("base64url");
const sessionId = randomBytes(32).toString("base64url");
const bytes = new Uint8Array([4, 5, 6]);
const receiptSecret = randomBytes(32).toString("base64url");

function settings() {
  return {
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  };
}

function makeUploadHandler(overrides: Partial<MailAttachmentUploadDependencies> = {}) {
  const dependencies: MailAttachmentUploadDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken, accountId: "account-1" }),
    revokeSession: async () => undefined,
    uploadAttachment: async () => ({
      blobId: "blob-1",
      type: "application/octet-stream",
      size: bytes.byteLength,
    }),
    createReceipt: (accountId, attachment) =>
      createMailAttachmentReceipt(accountId, attachment, receiptSecret),
    getJmapSettings: settings,
    isTrustedOrigin: () => true,
    ...overrides,
  };
  return { POST: createMailAttachmentUploadHandler(dependencies), dependencies };
}

function makeDownloadHandler(overrides: Partial<MailAttachmentDownloadDependencies> = {}) {
  const dependencies: MailAttachmentDownloadDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({ accessToken, accountId: "account-1" }),
    revokeSession: async () => undefined,
    downloadAttachment: async () => ({
      bytes,
      name: "report \"final\".pdf",
      size: bytes.byteLength,
    }),
    getJmapSettings: settings,
    ...overrides,
  };
  return { GET: createMailAttachmentDownloadHandler(dependencies), dependencies };
}

test("requires a trusted origin before reading an attachment upload", async () => {
  let sessionCalls = 0;
  const { POST } = makeUploadHandler({
    isTrustedOrigin: () => false,
    getSessionId: async () => {
      sessionCalls += 1;
      return sessionId;
    },
  });
  const response = await POST(new Request("https://webmail.example.test/api/upload", {
    method: "POST",
    body: bytes,
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(sessionCalls, 0);
});

test("uploads only the authenticated session's raw bytes and returns metadata", async () => {
  let received: unknown;
  const { POST } = makeUploadHandler({
    uploadAttachment: async (options) => {
      received = options;
      return { blobId: "blob-1", type: "application/pdf", size: bytes.byteLength };
    },
  });
  const response = await POST(new Request("https://webmail.example.test/api/upload", {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: bytes,
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    blobId: createMailAttachmentReceipt("account-1", {
      blobId: "blob-1",
      type: "application/pdf",
      size: bytes.byteLength,
    }, receiptSecret),
    type: "application/pdf",
    size: bytes.byteLength,
  });
  assert.deepEqual(received, {
    ...settings(),
    accessToken,
    expectedAccountId: "account-1",
    bytes,
    type: "application/pdf",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("rejects oversized uploads before calling the JMAP service", async () => {
  let uploadCalls = 0;
  const { POST } = makeUploadHandler({
    uploadAttachment: async () => {
      uploadCalls += 1;
      return { blobId: "blob-1", type: "application/octet-stream", size: 0 };
    },
  });
  const response = await POST(new Request("https://webmail.example.test/api/upload", {
    method: "POST",
    headers: { "content-length": String(MAX_MAIL_ATTACHMENT_BYTES + 1) },
  }));

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "attachment_too_large" });
  assert.equal(uploadCalls, 0);
});

test("download validates query IDs and forces a safe opaque attachment response", async () => {
  let received: unknown;
  const { GET } = makeDownloadHandler({
    downloadAttachment: async (options) => {
      received = options;
      return { bytes, name: "report \"final\".pdf", size: bytes.byteLength };
    },
  });
  const invalid = await GET(new Request(
    "https://webmail.example.test/api/download?emailId=email-1&emailId=email-2&attachmentIndex=0",
  ));
  assert.equal(invalid.status, 400);

  const response = await GET(new Request(
    "https://webmail.example.test/api/download?emailId=email-1&attachmentIndex=0",
  ));
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.equal(response.headers.get("content-disposition")?.includes('filename="report'), false);
  assert.equal(response.headers.get("content-disposition")?.includes("report%20%22final%22.pdf"), true);
  assert.deepEqual(received, {
    ...settings(),
    accessToken,
    expectedAccountId: "account-1",
    emailId: "email-1",
    attachmentIndex: 0,
  });
});

test("revokes the app session on primary-account mismatch", async () => {
  const revoked: string[] = [];
  const { GET } = makeDownloadHandler({
    downloadAttachment: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async (id) => {
      revoked.push(id);
    },
  });
  const response = await GET(new Request(
    "https://webmail.example.test/api/download?emailId=email-1&attachmentIndex=0",
  ));
  assert.equal(response.status, 401);
  assert.deepEqual(revoked, [sessionId]);
});
