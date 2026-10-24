export const MAX_THREAD_SUBJECT_REQUEST_BYTES = 4 * 1024;

export class InvalidThreadSubjectsRequest extends Error {
  constructor() {
    super("The thread subject request is invalid.");
    this.name = "InvalidThreadSubjectsRequest";
  }
}

export class OversizedThreadSubjectsRequest extends Error {
  constructor() {
    super("The thread subject request is too large.");
    this.name = "OversizedThreadSubjectsRequest";
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidThreadSubjectsRequest();
    if (Number(length) > MAX_THREAD_SUBJECT_REQUEST_BYTES) {
      throw new OversizedThreadSubjectsRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidThreadSubjectsRequest();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_THREAD_SUBJECT_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedThreadSubjectsRequest();
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
    throw new InvalidThreadSubjectsRequest();
  }
}

export async function parseThreadSubjectsRequest(request: Request): Promise<string> {
  const body = recordValue(await readJsonBody(request));
  if (!body || Object.keys(body).some((key) => key !== "subject")) {
    throw new InvalidThreadSubjectsRequest();
  }
  const subject = body.subject;
  if (
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(subject)
  ) {
    throw new InvalidThreadSubjectsRequest();
  }
  return subject;
}

export async function parseThreadSubjectCandidatesRequest(
  request: Request,
): Promise<string> {
  const body = recordValue(await readJsonBody(request));
  if (!body || Object.keys(body).some((key) => key !== "query")) {
    throw new InvalidThreadSubjectsRequest();
  }
  const query = body.query;
  if (
    typeof query !== "string" ||
    query.length === 0 ||
    query.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(query)
  ) {
    throw new InvalidThreadSubjectsRequest();
  }
  return query;
}
