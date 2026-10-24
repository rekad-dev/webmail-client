import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  type JmapEmailMailboxMembership,
} from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type MembershipOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthEmailMailboxMembership
>[0];

export interface MailMembershipSession {
  accessToken: string;
  accountId: string;
}

export interface MailMembershipRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailMembershipSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getMembership(options: MembershipOptions): Promise<JmapEmailMailboxMembership>;
  getJmapSettings(): Pick<
    MembershipOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
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
    throw new Error("invalid_email_id");
  }
  return emailId;
}

export function createMailMembershipGetHandler(
  dependencies: MailMembershipRouteDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    let emailId: string;
    try {
      emailId = readEmailId(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);

      const result = await dependencies.getMembership({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        emailId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(result, 200);
    } catch (error) {
      if (error instanceof JmapAccountMismatchError && sessionId) {
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
  };
}
