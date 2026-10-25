import type { JmapMailAttachmentInput } from "./client.mts";

// Vercel Function request and response bodies are limited to 4.5 MB. Keep a
// safety margin for framing and platform overhead on upload and download.
export const MAX_MAIL_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_RECEIPT_LENGTH = 1_200;
const MAX_ATTACHMENT_REQUEST_TYPE_LENGTH = 128;

export class InvalidMailAttachmentRequest extends Error {
  constructor() {
    super("The attachment request is invalid.");
    this.name = "InvalidMailAttachmentRequest";
  }
}

export class OversizedMailAttachmentRequest extends Error {
  constructor() {
    super("The attachment exceeds the application size limit.");
    this.name = "OversizedMailAttachmentRequest";
  }
}

function mediaType(value: string | null): string {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    type.length > 0 &&
    type.length <= MAX_ATTACHMENT_REQUEST_TYPE_LENGTH &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
  ) {
    return type;
  }
  return "application/octet-stream";
}

export async function parseMailAttachmentUploadRequest(
  request: Request,
): Promise<{ bytes: Uint8Array; type: string }> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidMailAttachmentRequest();
    if (Number(length) > MAX_MAIL_ATTACHMENT_BYTES) {
      throw new OversizedMailAttachmentRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailAttachmentRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MAIL_ATTACHMENT_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedMailAttachmentRequest();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, type: mediaType(request.headers.get("content-type")) };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseMailDraftAttachments(
  value: unknown,
): JmapMailAttachmentInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MAIL_ATTACHMENTS) {
    throw new InvalidMailAttachmentRequest();
  }

  let totalBytes = 0;
  return value.map((candidate) => {
    const attachment = recordValue(candidate);
    if (
      !attachment ||
      typeof attachment.blobId !== "string" ||
      attachment.blobId.length === 0 ||
      attachment.blobId.length > MAX_ATTACHMENT_RECEIPT_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(attachment.blobId) ||
      typeof attachment.name !== "string" ||
      attachment.name.length === 0 ||
      attachment.name.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(attachment.name) ||
      typeof attachment.type !== "string" ||
      attachment.type.length === 0 ||
      attachment.type.length > MAX_ATTACHMENT_REQUEST_TYPE_LENGTH ||
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.type) ||
      typeof attachment.size !== "number" ||
      !Number.isSafeInteger(attachment.size) ||
      attachment.size < 0 ||
      attachment.size > MAX_MAIL_ATTACHMENT_BYTES
    ) {
      throw new InvalidMailAttachmentRequest();
    }
    totalBytes += attachment.size;
    if (totalBytes > MAX_MAIL_ATTACHMENT_TOTAL_BYTES) {
      throw new OversizedMailAttachmentRequest();
    }
    return {
      blobId: attachment.blobId,
      name: sanitizeAttachmentName(attachment.name),
      type: attachment.type.toLowerCase(),
      size: attachment.size,
    };
  });
}

export function sanitizeAttachmentName(value: string): string {
  const name = value
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 256);
  return name || "attachment";
}
