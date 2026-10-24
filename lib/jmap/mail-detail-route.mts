import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  type JmapEmailDetail,
} from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type DetailOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthEmailDetail
>[0];
type MarkReadOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthMarkEmailRead
>[0];

export interface MailDetailSession {
  accessToken: string;
  accountId: string;
}

export interface MailDetailRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailDetailSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getEmailDetail(options: DetailOptions): Promise<JmapEmailDetail>;
  markEmailRead(options: MarkReadOptions): Promise<void>;
  getJmapSettings(): Pick<
    DetailOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

class InvalidEmailDetailRequest extends Error {}

interface AuthenticatedRequest {
  sessionId: string;
  session: MailDetailSession;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function readEmailId(request: Request): string {
  const values = new URL(request.url).searchParams.getAll("emailId");
  const emailId = values[0];
  if (
    values.length !== 1 ||
    !emailId ||
    emailId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(emailId)
  ) {
    throw new InvalidEmailDetailRequest();
  }
  return emailId;
}

async function authenticateRequest(
  request: Request,
  dependencies: MailDetailRouteDependencies,
): Promise<AuthenticatedRequest | Response> {
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

async function handleFailure(
  error: unknown,
  sessionId: string,
  dependencies: MailDetailRouteDependencies,
): Promise<Response> {
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  if (error instanceof JmapEmailNotFoundError) {
    return jsonResponse({ error: "message_not_found" }, 404);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

export function createMailDetailHandlers(
  dependencies: MailDetailRouteDependencies,
) {
  async function GET(request: Request): Promise<Response> {
    let emailId: string;
    try {
      emailId = readEmailId(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;

    try {
      const detail = await dependencies.getEmailDetail({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        emailId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(detail, 200);
    } catch (error) {
      return handleFailure(error, sessionId, dependencies);
    }
  }

  async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }

    let emailId: string;
    try {
      emailId = readEmailId(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;

    try {
      await dependencies.markEmailRead({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        emailId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse({ isUnread: false }, 200);
    } catch (error) {
      return handleFailure(error, sessionId, dependencies);
    }
  }

  return { GET, POST };
}
