import {
  JmapAccountMismatchError,
  JmapOfflineSyncIncompleteError,
  type JmapOfflineSyncResult,
} from "./client.mts";
import {
  InvalidOfflineSyncRequest,
  parseOfflineSyncRequest,
} from "./mail-offline-sync-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type OfflineSyncOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthOfflineSync
>[0];

export interface OfflineSyncSession {
  accessToken: string;
  accountId: string;
}

export interface OfflineSyncDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<OfflineSyncSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  sync(options: OfflineSyncOptions): Promise<JmapOfflineSyncResult>;
  getCacheScope(accountId: string): string;
  getJmapSettings(): Pick<
    OfflineSyncOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export function createOfflineSyncPostHandler(
  dependencies: OfflineSyncDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    const contentType = request.headers.get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    let input: Awaited<ReturnType<typeof parseOfflineSyncRequest>>;
    try {
      input = await parseOfflineSyncRequest(request);
    } catch (error) {
      if (error instanceof InvalidOfflineSyncRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    let sessionId: string | null;
    let session: OfflineSyncSession | null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    try {
      const result = await dependencies.sync({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...input,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse({
        cacheScope: dependencies.getCacheScope(session.accountId),
        ...result,
      }, 200);
    } catch (error) {
      if (error instanceof JmapAccountMismatchError) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      if (error instanceof JmapOfflineSyncIncompleteError) {
        return jsonResponse({ error: "offline_sync_incomplete" }, 422);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
