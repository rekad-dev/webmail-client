import type { JmapMailDraftInput } from "./client.mts";
import { composedHtmlToText, sanitizeComposedHtml } from "../mail/composed-content.mts";
import {
  OversizedMailAttachmentRequest,
  parseMailDraftAttachments,
} from "./mail-attachment-request.mts";

export const MAX_MAIL_DRAFT_REQUEST_BYTES = 640 * 1024;
export const MAX_MAIL_DRAFT_BODY_BYTES = 256 * 1024;

export interface MailDraftRequest {
  draftId?: string;
  input: JmapMailDraftInput;
}

export class InvalidMailDraftRequest extends Error {
  constructor() {
    super("The draft request is invalid.");
    this.name = "InvalidMailDraftRequest";
  }
}

export class OversizedMailDraftRequest extends Error {
  constructor() {
    super("The draft request is too large.");
    this.name = "OversizedMailDraftRequest";
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isValidEmailAddress(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 254 ||
    /[\u0000-\u0020\u007f<>,;:"\\]/.test(value)
  ) return false;
  const at = value.lastIndexOf("@");
  if (at < 1 || at !== value.indexOf("@") || at > 64) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return (
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    domain.length > 0 &&
    !domain.startsWith(".") &&
    !domain.endsWith(".") &&
    domain.split(".").every((label) =>
      label.length > 0 &&
      label.length <= 63 &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      /^[\p{L}\p{N}-]+$/u.test(label),
    )
  );
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidMailDraftRequest();
    if (Number(length) > MAX_MAIL_DRAFT_REQUEST_BYTES) {
      throw new OversizedMailDraftRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailDraftRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MAIL_DRAFT_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedMailDraftRequest();
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
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new InvalidMailDraftRequest();
  }
}

function parseRecipients(value: unknown): JmapMailDraftInput["to"] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new InvalidMailDraftRequest();
  }
  const seen = new Set<string>();
  return value.map((address) => {
    if (typeof address !== "string" || !isValidEmailAddress(address)) {
      throw new InvalidMailDraftRequest();
    }
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) throw new InvalidMailDraftRequest();
    seen.add(normalized);
    return { name: null, email: address };
  });
}

function parseMessageIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) {
    throw new InvalidMailDraftRequest();
  }
  return value.map((id) => {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > 998 ||
      /[\u0000-\u001f\u007f]/.test(id)
    ) {
      throw new InvalidMailDraftRequest();
    }
    return id;
  });
}

export async function parseMailDraftRequest(
  request: Request,
): Promise<MailDraftRequest> {
  const body = recordValue(await readBody(request));
  if (!body) throw new InvalidMailDraftRequest();
  const allowedKeys = new Set([
    "draftId",
    "identityId",
    "fromEmail",
    "to",
    "cc",
    "bcc",
    "subject",
    "body",
    "formattedBody",
    "attachments",
    "inReplyTo",
    "references",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new InvalidMailDraftRequest();
  }
  if (
    typeof body.identityId !== "string" ||
    body.identityId.length === 0 ||
    body.identityId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(body.identityId) ||
    typeof body.subject !== "string" ||
    body.subject.length > 998 ||
    Buffer.byteLength(body.subject, "utf8") > 998 ||
    /[\u0000-\u0008\u000a-\u001f\u007f]/.test(body.subject) ||
    typeof body.body !== "string" ||
    Buffer.byteLength(body.body, "utf8") > MAX_MAIL_DRAFT_BODY_BYTES ||
    body.body.includes("\u0000") ||
    body.formattedBody !== undefined && typeof body.formattedBody !== "string"
  ) {
    throw new InvalidMailDraftRequest();
  }
  if (
    body.draftId !== undefined &&
    (typeof body.draftId !== "string" ||
      body.draftId.length === 0 ||
      body.draftId.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(body.draftId))
  ) {
    throw new InvalidMailDraftRequest();
  }
  if (
    body.fromEmail !== undefined &&
    (typeof body.fromEmail !== "string" || !isValidEmailAddress(body.fromEmail))
  ) {
    throw new InvalidMailDraftRequest();
  }

  const to = parseRecipients(body.to);
  const cc = parseRecipients(body.cc);
  const bcc = parseRecipients(body.bcc);
  if (to.length + cc.length + bcc.length > 50) {
    throw new InvalidMailDraftRequest();
  }
  const inReplyTo = parseMessageIds(body.inReplyTo);
  const references = parseMessageIds(body.references);
  let htmlBody: string | undefined;
  let textBody = body.body;
  if (typeof body.formattedBody === "string") {
    try {
      htmlBody = sanitizeComposedHtml(body.formattedBody);
      textBody = composedHtmlToText(htmlBody);
    } catch {
      throw new OversizedMailDraftRequest();
    }
    if (Buffer.byteLength(textBody, "utf8") > MAX_MAIL_DRAFT_BODY_BYTES) {
      throw new OversizedMailDraftRequest();
    }
  }
  let attachments;
  try {
    attachments = parseMailDraftAttachments(body.attachments);
  } catch (error) {
    if (error instanceof OversizedMailAttachmentRequest) {
      throw new OversizedMailDraftRequest();
    }
    throw new InvalidMailDraftRequest();
  }
  return {
    ...(typeof body.draftId === "string" ? { draftId: body.draftId } : {}),
    input: {
      identityId: body.identityId,
      ...(typeof body.fromEmail === "string" ? { fromEmail: body.fromEmail } : {}),
      to,
      cc,
      bcc,
      subject: body.subject,
      body: textBody,
      ...(htmlBody === undefined ? {} : { htmlBody }),
      attachments,
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
    },
  };
}
