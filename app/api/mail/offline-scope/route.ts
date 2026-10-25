import {
  getAuthenticatedOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { createOfflineCacheScope } from "@/lib/auth/offline-cache-scope.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionId = await getRequestOAuthSessionId(request);
    if (!sessionId) {
      return Response.json({ error: "sign_in_required" }, { status: 401, headers: HEADERS });
    }
    const session = await getAuthenticatedOAuthSession(sessionId);
    if (!session) {
      return Response.json({ error: "sign_in_required" }, { status: 401, headers: HEADERS });
    }
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is unavailable.");
    return Response.json(
      { cacheScope: createOfflineCacheScope(session.accountId, secret) },
      { status: 200, headers: HEADERS },
    );
  } catch {
    return Response.json({ error: "mail_unavailable" }, { status: 503, headers: HEADERS });
  }
}
