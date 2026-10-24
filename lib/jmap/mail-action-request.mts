import type { JmapMailActionInput } from "./client.mts";

export const MAX_MAIL_ACTION_REQUEST_BYTES = 8 * 1024;

export class InvalidMailActionRequest extends Error {
  constructor() {
    super("The mailbox action request is invalid.");
    this.name = "InvalidMailActionRequest";
  }
}

export class OversizedMailActionRequest extends Error {
  constructor() {
    super("The mailbox action request is too large.");
    this.name = "OversizedMailActionRequest";
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidMailActionRequest();
    if (Number(length) > MAX_MAIL_ACTION_REQUEST_BYTES) {
      throw new OversizedMailActionRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailActionRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MAIL_ACTION_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedMailActionRequest();
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
    throw new InvalidMailActionRequest();
  }
}

export async function parseMailActionRequest(
  request: Request,
): Promise<JmapMailActionInput> {
  const body = recordValue(await readBody(request));
  if (!body) throw new InvalidMailActionRequest();
  const allowedKeys = new Set([
    "action",
    "emailId",
    "threadId",
    "sourceMailboxId",
    "destinationMailboxId",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new InvalidMailActionRequest();
  }
  const actions = new Set([
    "mark_read",
    "mark_unread",
    "star",
    "unstar",
    "move",
    "archive",
    "trash",
  ]);
  if (typeof body.action !== "string" || !actions.has(body.action)) {
    throw new InvalidMailActionRequest();
  }
  const hasEmail = Object.hasOwn(body, "emailId");
  const hasThread = Object.hasOwn(body, "threadId");
  if (hasEmail === hasThread) throw new InvalidMailActionRequest();
  if (
    (hasEmail && !validId(body.emailId)) ||
    (hasThread && !validId(body.threadId)) ||
    (Object.hasOwn(body, "sourceMailboxId") && !validId(body.sourceMailboxId)) ||
    (Object.hasOwn(body, "destinationMailboxId") && !validId(body.destinationMailboxId))
  ) {
    throw new InvalidMailActionRequest();
  }
  if (
    body.action === "move"
      ? !validId(body.destinationMailboxId)
      : Object.hasOwn(body, "destinationMailboxId")
  ) {
    throw new InvalidMailActionRequest();
  }
  if (body.action !== "move" && Object.hasOwn(body, "sourceMailboxId")) {
    throw new InvalidMailActionRequest();
  }

  return {
    action: body.action as JmapMailActionInput["action"],
    ...(hasEmail ? { emailId: body.emailId as string } : {}),
    ...(hasThread ? { threadId: body.threadId as string } : {}),
    ...(typeof body.sourceMailboxId === "string"
      ? { sourceMailboxId: body.sourceMailboxId }
      : {}),
    ...(typeof body.destinationMailboxId === "string"
      ? { destinationMailboxId: body.destinationMailboxId }
      : {}),
  };
}
