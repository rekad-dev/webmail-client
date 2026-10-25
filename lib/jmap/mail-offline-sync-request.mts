export const MAX_OFFLINE_SYNC_REQUEST_BYTES = 16 * 1024;

export class InvalidOfflineSyncRequest extends Error {
  constructor() {
    super("The offline sync request is invalid.");
    this.name = "InvalidOfflineSyncRequest";
  }
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length) || Number(length) > MAX_OFFLINE_SYNC_REQUEST_BYTES) {
      throw new InvalidOfflineSyncRequest();
    }
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidOfflineSyncRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_OFFLINE_SYNC_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new InvalidOfflineSyncRequest();
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
    throw new InvalidOfflineSyncRequest();
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function parseOfflineSyncRequest(
  request: Request,
): Promise<{ sinceState: string; emailIds: string[] }> {
  const body = recordValue(await readBody(request));
  if (!body || Object.keys(body).some((key) => !["sinceState", "emailIds"].includes(key))) {
    throw new InvalidOfflineSyncRequest();
  }
  if (
    typeof body.sinceState !== "string" ||
    body.sinceState.length === 0 ||
    body.sinceState.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(body.sinceState) ||
    !Array.isArray(body.emailIds) ||
    body.emailIds.length === 0 ||
    body.emailIds.length > 20
  ) {
    throw new InvalidOfflineSyncRequest();
  }
  const seen = new Set<string>();
  const emailIds = body.emailIds.map((candidate) => {
    if (
      typeof candidate !== "string" ||
      candidate.length === 0 ||
      candidate.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(candidate) ||
      seen.has(candidate)
    ) {
      throw new InvalidOfflineSyncRequest();
    }
    seen.add(candidate);
    return candidate;
  });
  return { sinceState: body.sinceState, emailIds };
}
