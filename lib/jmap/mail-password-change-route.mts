import {
  JmapAccountMismatchError,
  JmapPasswordChangeOutcomeUnknownError,
  JmapPasswordChangeRejectedError,
  JmapPasswordChangeUnavailableError,
} from "./client.mts";
import {
  InvalidMailPasswordChangeRequest,
  OversizedMailPasswordChangeRequest,
  parseMailPasswordChangeRequest,
} from "./mail-password-change-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type PasswordChangeOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthPasswordChange
>[0];

export interface MailPasswordChangeSession {
  accessToken: string;
  accountId: string;
}

export interface MailPasswordChangeRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailPasswordChangeSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  changePassword(options: PasswordChangeOptions): Promise<void>;
  getJmapSettings(): Pick<
    PasswordChangeOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}

async function authenticateRequest(
  request: Request,
  dependencies: MailPasswordChangeRouteDependencies,
): Promise<{ sessionId: string; session: MailPasswordChangeSession } | Response> {
  try {
    const sessionId = await dependencies.getSessionId(request);
    if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
    const session = await dependencies.getAuthenticatedSession(sessionId);
    if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    return { sessionId, session };
  } catch {
    return jsonResponse({ error: "mail_unavailable" }, 503);
  }
}

async function mapFailure(
  error: unknown,
  sessionId: string,
  dependencies: MailPasswordChangeRouteDependencies,
): Promise<Response> {
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  if (error instanceof JmapPasswordChangeUnavailableError) {
    return jsonResponse({ error: "password_change_unavailable" }, 409);
  }
  if (error instanceof JmapPasswordChangeRejectedError) {
    return jsonResponse({ error: "password_change_rejected" }, 422);
  }
  if (error instanceof JmapPasswordChangeOutcomeUnknownError) {
    return jsonResponse({ error: "password_change_outcome_unknown" }, 502);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

export function createMailPasswordChangePostHandler(
  dependencies: MailPasswordChangeRouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (!contentTypeIsJson(request)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let input;
    try {
      input = await parseMailPasswordChangeRequest(request);
    } catch (error) {
      if (error instanceof OversizedMailPasswordChangeRequest) {
        return jsonResponse({ error: "request_too_large" }, 413);
      }
      if (error instanceof InvalidMailPasswordChangeRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;
    try {
      await dependencies.changePassword({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        input,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      return mapFailure(error, sessionId, dependencies);
    }
  };
}
