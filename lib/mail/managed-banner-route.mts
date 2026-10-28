import type { ManagedMailBanners } from "./composed-content.mts";

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
interface ManagedBannerSessionDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<{ subject: string } | null>;
  getBanners(): Promise<ManagedMailBanners>;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

async function authenticate(
  request: Request,
  dependencies: ManagedBannerSessionDependencies,
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
