import {
  MAX_PROFILE_PICTURE_BYTES,
  validateProfilePicture,
  type ProfilePictureType,
} from "./profile-picture-image.mts";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

export interface ProfilePictureRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getSessionSummary(sessionId: string): Promise<{ subject: string } | null>;
  isTrustedOrigin(request: Request): boolean;
  getPicture(subject: string): Promise<{ type: ProfilePictureType; bytes: Uint8Array; updatedAt: Date } | null>;
  savePicture(subject: string, type: ProfilePictureType, bytes: Uint8Array): Promise<number>;
  deletePicture(subject: string): Promise<void>;
}

class TooLarge extends Error {}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

async function readBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw new RangeError("invalid length");
    if (Number(declared) > MAX_PROFILE_PICTURE_BYTES) throw new TooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RangeError("empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROFILE_PICTURE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new TooLarge();
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
  return bytes;
}

/** Each person can read, replace, and remove only their own picture, keyed by their OAuth subject. */
export function createProfilePictureHandlers(dependencies: ProfilePictureRouteDependencies) {
  async function authenticate(request: Request): Promise<{ subject: string } | Response> {
    try {
      const sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return json({ error: "sign_in_required" }, 401);
      const session = await dependencies.getSessionSummary(sessionId);
      return session ? { subject: session.subject } : json({ error: "sign_in_required" }, 401);
    } catch {
      return json({ error: "profile_unavailable" }, 503);
    }
  }

  async function GET(request: Request): Promise<Response> {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    try {
      const picture = await dependencies.getPicture(auth.subject);
      if (!picture) return json({ error: "no_picture" }, 404);
      const etag = `"${picture.updatedAt.getTime()}"`;
      const headers = new Headers({
        "Content-Type": picture.type,
        "Cache-Control": "private, no-cache",
        ETag: etag,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      });
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      headers.set("Content-Length", String(picture.bytes.byteLength));
      return new Response(new Uint8Array(picture.bytes).buffer, { status: 200, headers });
    } catch {
      return json({ error: "profile_unavailable" }, 503);
    }
  }

  async function PUT(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;

    let bytes: Uint8Array;
    try {
      bytes = await readBody(request);
    } catch (error) {
      if (error instanceof TooLarge) return json({ error: "picture_too_large" }, 413);
      return json({ error: "invalid_picture" }, 400);
    }
    const picture = validateProfilePicture(bytes);
    if (!picture) return json({ error: "invalid_picture" }, 400);
    try {
      const version = await dependencies.savePicture(auth.subject, picture.type, picture.bytes);
      return json({ version }, 200);
    } catch {
      return json({ error: "profile_unavailable" }, 503);
    }
  }

  async function DELETE(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    try {
      await dependencies.deletePicture(auth.subject);
      return json({ ok: true }, 200);
    } catch {
      return json({ error: "profile_unavailable" }, 503);
    }
  }

  return { GET, PUT, DELETE };
}
