import {
  sanitizeComposedHtml,
  type ManagedMailBanners,
} from "./composed-content.mts";

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const MAX_SETTINGS_BODY_BYTES = 64 * 1024;
const MAX_BANNER_HTML_BYTES = 32 * 1024;

interface ManagedBannerSessionDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<{ subject: string } | null>;
  getBanners(): Promise<ManagedMailBanners>;
}

export interface ManagedBannerRouteDependencies extends ManagedBannerSessionDependencies {
  isAdmin(subject: string): boolean;
  isTrustedOrigin(request: Request): boolean;
  saveBanners(input: Pick<ManagedMailBanners, "headerHtml" | "footerHtml">): Promise<ManagedMailBanners>;
}

class InvalidSettingsBody extends Error {}
class OversizedSettingsBody extends Error {}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

async function readSettingsBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new InvalidSettingsBody();
    if (Number(contentLength) > MAX_SETTINGS_BODY_BYTES) throw new OversizedSettingsBody();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidSettingsBody();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_SETTINGS_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedSettingsBody();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new InvalidSettingsBody();
  }
}

function parseSettings(value: unknown): Pick<ManagedMailBanners, "headerHtml" | "footerHtml"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidSettingsBody();
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== "headerHtml" && key !== "footerHtml") ||
    typeof body.headerHtml !== "string" ||
    typeof body.footerHtml !== "string"
  ) throw new InvalidSettingsBody();
  const headerHtml = sanitizeComposedHtml(body.headerHtml);
  const footerHtml = sanitizeComposedHtml(body.footerHtml);
  if (
    Buffer.byteLength(headerHtml, "utf8") > MAX_BANNER_HTML_BYTES ||
    Buffer.byteLength(footerHtml, "utf8") > MAX_BANNER_HTML_BYTES
  ) throw new OversizedSettingsBody();
  return { headerHtml, footerHtml };
}

async function authenticate(
  request: Request,
  dependencies: ManagedBannerRouteDependencies,
): Promise<{ sessionId: string; subject: string } | Response> {
  try {
    const sessionId = await dependencies.getSessionId(request);
    if (!sessionId) return json({ error: "sign_in_required" }, 401);
    const session = await dependencies.getAuthenticatedSession(sessionId);
    if (!session) return json({ error: "sign_in_required" }, 401);
    return { sessionId, subject: session.subject };
  } catch {
    return json({ error: "settings_unavailable" }, 503);
  }
}

async function responseWithBanners(
  getBanners: () => Promise<ManagedMailBanners>,
): Promise<Response> {
  try {
    return json(await getBanners(), 200);
  } catch {
    return json({ error: "settings_unavailable" }, 503);
  }
}

export function createUserBannerGetHandler(
  dependencies: ManagedBannerSessionDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const authenticated = await authenticate(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    return responseWithBanners(dependencies.getBanners);
  };
}

export function createAdminBannerHandlers(
  dependencies: ManagedBannerRouteDependencies,
) {
  async function authorize(request: Request): Promise<Response | null> {
    const authenticated = await authenticate(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    if (!dependencies.isAdmin(authenticated.subject)) {
      return json({ error: "forbidden" }, 403);
    }
    return null;
  }

  async function GET(request: Request): Promise<Response> {
    const denied = await authorize(request);
    if (denied) return denied;
    return responseWithBanners(dependencies.getBanners);
  }

  async function PUT(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return json({ error: "origin_not_allowed" }, 403);
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return json({ error: "invalid_request" }, 400);
    }
    const denied = await authorize(request);
    if (denied) return denied;

    let settings: Pick<ManagedMailBanners, "headerHtml" | "footerHtml">;
    try {
      settings = parseSettings(await readSettingsBody(request));
    } catch (error) {
      if (error instanceof OversizedSettingsBody) {
        return json({ error: "settings_too_large" }, 413);
      }
      if (error instanceof InvalidSettingsBody || error instanceof RangeError) {
        return json({ error: "invalid_request" }, 400);
      }
      return json({ error: "settings_unavailable" }, 503);
    }

    try {
      return json(await dependencies.saveBanners(settings), 200);
    } catch {
      return json({ error: "settings_unavailable" }, 503);
    }
  }

  return { GET, PUT };
}
