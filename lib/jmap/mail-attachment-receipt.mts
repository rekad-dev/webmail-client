import { createHmac, timingSafeEqual } from "node:crypto";

import {
  MAX_MAIL_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
} from "./mail-attachment-request.mts";
import type { JmapMailAttachmentInput } from "./client.mts";

const RECEIPT_PREFIX = "ra1";
const RECEIPT_DOMAIN = "rekad-mail-attachment-receipt\0";
const MAX_RECEIPT_LENGTH = 1_200;

export class InvalidMailAttachmentReceipt extends Error {
  constructor() {
    super("The attachment upload receipt is invalid.");
    this.name = "InvalidMailAttachmentReceipt";
  }
}

export interface AttachmentReceiptPayload {
  blobId: string;
  type: string;
  size: number;
}

function validateReceiptSecret(secret: string): void {
  if (secret.length < 32) throw new Error("Attachment receipt signing is unavailable.");
}

function validPayload(value: unknown): value is AttachmentReceiptPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.blobId === "string" &&
    record.blobId.length > 0 &&
    record.blobId.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(record.blobId) &&
    typeof record.type === "string" &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(record.type) &&
    typeof record.size === "number" &&
    Number.isSafeInteger(record.size) &&
    record.size >= 0 &&
    record.size <= MAX_MAIL_ATTACHMENT_BYTES;
}

function sign(payload: string, accountId: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(RECEIPT_DOMAIN)
    .update(accountId)
    .update("\0")
    .update(payload)
    .digest();
}

export function createMailAttachmentReceipt(
  accountId: string,
  attachment: AttachmentReceiptPayload,
  secret: string,
): string {
  validateReceiptSecret(secret);
  if (!accountId || accountId.length > 256 || /[\u0000-\u001f\u007f]/.test(accountId)) {
    throw new Error("Attachment receipt account is invalid.");
  }
  if (!validPayload(attachment)) throw new Error("Attachment receipt data is invalid.");
  const payload = Buffer.from(JSON.stringify({
    blobId: attachment.blobId,
    type: attachment.type.toLowerCase(),
    size: attachment.size,
  })).toString("base64url");
  const signature = sign(payload, accountId, secret).toString("base64url");
  return `${RECEIPT_PREFIX}.${payload}.${signature}`;
}

export function readMailAttachmentReceipt(
  accountId: string,
  receipt: string,
  secret: string,
): AttachmentReceiptPayload {
  validateReceiptSecret(secret);
  if (!accountId || receipt.length === 0 || receipt.length > MAX_RECEIPT_LENGTH) {
    throw new InvalidMailAttachmentReceipt();
  }
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== RECEIPT_PREFIX) {
    throw new InvalidMailAttachmentReceipt();
  }
  const [, encodedPayload, encodedSignature] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload) || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw new InvalidMailAttachmentReceipt();
  }
  const expected = sign(encodedPayload, accountId, secret);
  const actual = Buffer.from(encodedSignature, "base64url");
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    throw new InvalidMailAttachmentReceipt();
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new InvalidMailAttachmentReceipt();
  }
  if (!validPayload(payload)) throw new InvalidMailAttachmentReceipt();
  return { ...payload, type: payload.type.toLowerCase() };
}

export function signDraftAttachmentReceipts<T extends {
  attachments: Array<AttachmentReceiptPayload & { name: string }>;
}>(draft: T, accountId: string, secret: string): T {
  return {
    ...draft,
    attachments: draft.attachments.map((attachment) => ({
      ...attachment,
      blobId: createMailAttachmentReceipt(accountId, attachment, secret),
      name: sanitizeAttachmentName(attachment.name),
    })),
  };
}

export function resolveMailAttachmentReceipts(
  attachments: JmapMailAttachmentInput[] | undefined,
  accountId: string,
  secret: string,
): JmapMailAttachmentInput[] | undefined {
  if (!attachments) return undefined;
  return attachments.map((attachment) => {
    if (
      !attachment ||
      typeof attachment.name !== "string" ||
      attachment.name.length === 0 ||
      attachment.name.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(attachment.name) ||
      typeof attachment.type !== "string" ||
      typeof attachment.size !== "number"
    ) {
      throw new InvalidMailAttachmentReceipt();
    }
    const verified = readMailAttachmentReceipt(accountId, attachment.blobId, secret);
    if (
      verified.type !== attachment.type.toLowerCase() ||
      verified.size !== attachment.size
    ) {
      throw new InvalidMailAttachmentReceipt();
    }
    return {
      blobId: verified.blobId,
      type: verified.type,
      size: verified.size,
      name: sanitizeAttachmentName(attachment.name),
    };
  });
}
