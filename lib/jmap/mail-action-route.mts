import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  JmapMailActionUnavailableError,
  JmapMailboxNotFoundError,
  type JmapMailActionInput,
} from "./client.mts";
import {
  InvalidMailActionRequest,
  OversizedMailActionRequest,
  parseMailActionRequest,
} from "./mail-action-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type ActionOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthMailAction
>[0];

export interface MailActionSession {
  accessToken: string;
  accountId: string;
}

export interface MailActionRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailActionSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  updateMail(options: ActionOptions): Promise<void>;
  getJmapSettings(): Pick<
    ActionOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

async function authenticateRequest(
  request: Request,
  dependencies: MailActionRouteDependencies,
): Promise<{
  sessionId: string;
  session: MailActionSession;
} | Response> {
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
  dependencies: MailActionRouteDependencies,
): Promise<Response> {
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  if (
    error instanceof JmapEmailNotFoundError ||
    error instanceof JmapMailboxNotFoundError
  ) {
    return jsonResponse({ error: "mail_not_found" }, 404);
  }
  if (error instanceof JmapMailActionUnavailableError) {
    return jsonResponse({ error: error.reason }, 409);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}

export function createMailActionPostHandler(
  dependencies: MailActionRouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (!contentTypeIsJson(request)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let input: JmapMailActionInput;
    try {
      input = await parseMailActionRequest(request);
    } catch (error) {
      if (error instanceof OversizedMailActionRequest) {
        return jsonResponse({ error: "request_too_large" }, 413);
      }
      if (error instanceof InvalidMailActionRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;
    try {
      await dependencies.updateMail({
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
