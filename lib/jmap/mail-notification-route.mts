import {
  JmapAccountMismatchError,
  JmapInboxChangesIncompleteError,
  type JmapInboxChangesResult,
} from "./client.mts";
import {
  InvalidMailNotificationRequest,
  parseMailNotificationRequest,
} from "./mail-notification-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type InboxChangesOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthInboxChanges
>[0];

export interface MailNotificationSession {
  accessToken: string;
  accountId: string;
}

export interface MailNotificationDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailNotificationSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getChanges(options: InboxChangesOptions): Promise<JmapInboxChangesResult>;
  getCacheScope(accountId: string): string;
  getJmapSettings(): Pick<
    InboxChangesOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export function createMailNotificationPostHandler(
  dependencies: MailNotificationDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    const contentType = request.headers.get("content-type")
      ?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    let input: Awaited<ReturnType<typeof parseMailNotificationRequest>>;
    try {
      input = await parseMailNotificationRequest(request);
    } catch (error) {
      return jsonResponse({ error: error instanceof InvalidMailNotificationRequest
        ? "invalid_request"
        : "mail_unavailable" }, error instanceof InvalidMailNotificationRequest ? 400 : 503);
    }

    let sessionId: string | null;
    let session: MailNotificationSession | null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    try {
      const result = await dependencies.getChanges({
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
      if (error instanceof JmapInboxChangesIncompleteError) {
        return jsonResponse({ error: "notification_sync_incomplete" }, 422);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
