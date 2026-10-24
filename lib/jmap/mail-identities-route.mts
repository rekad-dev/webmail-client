import {
  JmapAccountMismatchError,
  type JmapComposePreflight,
} from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type PreflightOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthComposePreflight
>[0];

export interface MailIdentitySession {
  accessToken: string;
  accountId: string;
}

export interface MailIdentitiesRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailIdentitySession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getComposePreflight(options: PreflightOptions): Promise<JmapComposePreflight>;
  getJmapSettings(): Pick<
    PreflightOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

interface AuthenticatedRequest {
  sessionId: string;
  session: MailIdentitySession;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

async function authenticateRequest(
  request: Request,
  dependencies: MailIdentitiesRouteDependencies,
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
  dependencies: MailIdentitiesRouteDependencies,
): Promise<Response> {
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

export function createMailIdentitiesGetHandler(
  dependencies: MailIdentitiesRouteDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;

    try {
      const result = await dependencies.getComposePreflight({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return handleFailure(error, sessionId, dependencies);
    }
  };
}
