export const MAX_NOTIFICATION_REQUEST_BYTES = 16 * 1024;

export class InvalidMailNotificationRequest extends Error {
  constructor() {
    super("The mail notification request is invalid.");
    this.name = "InvalidMailNotificationRequest";
  }
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_NOTIFICATION_REQUEST_BYTES)) {
    throw new InvalidMailNotificationRequest();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailNotificationRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_NOTIFICATION_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new InvalidMailNotificationRequest();
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
    throw new InvalidMailNotificationRequest();
  }
}

export async function parseMailNotificationRequest(
  request: Request,
): Promise<{ sinceState: string | null }> {
  const value = await readBody(request);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidMailNotificationRequest();
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "sinceState")) {
    throw new InvalidMailNotificationRequest();
  }
  if (body.sinceState === null) return { sinceState: null };
  if (
    typeof body.sinceState !== "string" ||
    body.sinceState.length === 0 ||
    body.sinceState.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(body.sinceState)
  ) {
    throw new InvalidMailNotificationRequest();
  }
  return { sinceState: body.sinceState };
}
