import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  createMailAttachmentReceipt,
  readMailAttachmentReceipt,
  resolveMailAttachmentReceipts,
} from "../lib/jmap/mail-attachment-receipt.mts";

const secret = randomBytes(32).toString("base64url");
const payload = {
  blobId: "trusted-blob-id",
  type: "application/pdf",
  size: 1234,
};

test("attachment receipts preserve server-reported blob size and bind to the account", () => {
  const receipt = createMailAttachmentReceipt("account-1", payload, secret);
  assert.deepEqual(readMailAttachmentReceipt("account-1", receipt, secret), payload);
  assert.throws(() => readMailAttachmentReceipt("account-2", receipt, secret));
  assert.throws(() => readMailAttachmentReceipt("account-1", `${receipt}x`, secret));
});

test("resolves signed references to authoritative blob metadata and rejects forged size", () => {
  const receipt = createMailAttachmentReceipt("account-1", payload, secret);
  const metadata = [{
    blobId: receipt,
    name: "report.pdf",
    type: payload.type,
    size: payload.size,
  }];
  assert.deepEqual(resolveMailAttachmentReceipts(metadata, "account-1", secret), [{
    blobId: payload.blobId,
    name: "report.pdf",
    type: payload.type,
    size: payload.size,
  }]);
  assert.throws(() => resolveMailAttachmentReceipts([
    { ...metadata[0]!, size: 0 },
  ], "account-1", secret));
  assert.throws(() => resolveMailAttachmentReceipts([
    { ...metadata[0]!, blobId: "raw-client-selected-blob" },
  ], "account-1", secret));
});
