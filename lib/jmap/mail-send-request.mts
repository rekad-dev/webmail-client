import type { JmapEmailAddress, JmapMailSendInput } from "./client.mts";

export const MAX_MAIL_SEND_REQUEST_BYTES = 384 * 1024;
export const MAX_MAIL_SEND_BODY_BYTES = 256 * 1024;
export const MAX_MAIL_SEND_RECIPIENTS = 50;

export interface MailSendRequest extends JmapMailSendInput {
  attemptKey: string;
}

export class InvalidMailSendRequest extends Error {
  constructor() {
    super("The mail send request is invalid.");
    this.name = "InvalidMailSendRequest";
  }
}

export class OversizedMailSendRequest extends Error {
  constructor() {
    super("The mail send request is too large.");
    this.name = "OversizedMailSendRequest";
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
  ) {
    return false;
  }
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

function parseRecipients(value: unknown): JmapEmailAddress[] {
  if (!Array.isArray(value) || value.length > MAX_MAIL_SEND_RECIPIENTS) {
    throw new InvalidMailSendRequest();
  }
  return value.map((address) => {
    if (typeof address !== "string" || !isValidEmailAddress(address)) {
      throw new InvalidMailSendRequest();
    }
    return { name: null, email: address };
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidMailSendRequest();
    if (Number(length) > MAX_MAIL_SEND_REQUEST_BYTES) {
      throw new OversizedMailSendRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailSendRequest();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_MAIL_SEND_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedMailSendRequest();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new InvalidMailSendRequest();
  }
}

export async function parseMailSendRequest(
  request: Request,
): Promise<MailSendRequest> {
  const body = recordValue(await readJsonBody(request));
  if (!body) throw new InvalidMailSendRequest();
  const allowedKeys = new Set([
    "attemptKey",
    "identityId",
    "fromEmail",
    "to",
    "cc",
    "bcc",
    "subject",
    "body",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new InvalidMailSendRequest();
  }

  if (
    typeof body.attemptKey !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(body.attemptKey) ||
    Buffer.from(body.attemptKey, "base64url").length !== 32 ||
    typeof body.identityId !== "string" ||
    body.identityId.length === 0 ||
    body.identityId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(body.identityId) ||
    typeof body.subject !== "string" ||
    body.subject.length > 998 ||
    Buffer.byteLength(body.subject, "utf8") > 998 ||
    /[\u0000-\u0008\u000a-\u001f\u007f]/.test(body.subject) ||
    typeof body.body !== "string" ||
    Buffer.byteLength(body.body, "utf8") > MAX_MAIL_SEND_BODY_BYTES ||
    body.body.includes("\u0000")
  ) {
    throw new InvalidMailSendRequest();
  }

  if (
    body.fromEmail !== undefined &&
    (typeof body.fromEmail !== "string" ||
      !isValidEmailAddress(body.fromEmail))
  ) {
    throw new InvalidMailSendRequest();
  }

  const to = parseRecipients(body.to);
  const cc = parseRecipients(body.cc);
  const bcc = parseRecipients(body.bcc);
  if (to.length + cc.length + bcc.length > MAX_MAIL_SEND_RECIPIENTS) {
    throw new InvalidMailSendRequest();
  }
  const recipientSet = new Set<string>();
  for (const recipient of [...to, ...cc, ...bcc]) {
    const normalized = recipient.email.toLowerCase();
    if (recipientSet.has(normalized)) throw new InvalidMailSendRequest();
    recipientSet.add(normalized);
  }

  return {
    attemptKey: body.attemptKey,
    identityId: body.identityId,
    ...(typeof body.fromEmail === "string" ? { fromEmail: body.fromEmail } : {}),
    to,
    cc,
    bcc,
    subject: body.subject,
    body: body.body,
  };
}
