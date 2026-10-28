import { mailAccountOption, sharedAccountErrorResponse } from "./mail-account-param.mts";
import { JmapAccountMismatchError, JmapEmailNotFoundError } from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type RawMessageOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthRawMessage
>[0];

export interface MailOriginalSession {
  accessToken: string;
  accountId: string;
}

export interface MailOriginalDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailOriginalSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getRawMessage(options: RawMessageOptions): Promise<{
    text: string;
    size: number;
    truncated: boolean;
  }>;
  getJmapSettings(): Pick<
    RawMessageOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function readEmailId(request: Request): string | null {
  const emailIds = new URL(request.url).searchParams.getAll("emailId");
  const emailId = emailIds[0];
  if (
    emailIds.length !== 1 ||
    !emailId ||
    emailId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(emailId)
  ) {
    return null;
  }
  return emailId;
}

export function createMailOriginalHandler(dependencies: MailOriginalDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const emailId = readEmailId(request);
    if (!emailId) return jsonResponse({ error: "invalid_request" }, 400);

    let sessionId: string | null;
    let session: MailOriginalSession | null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    try {
      const original = await dependencies.getRawMessage({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...mailAccountOption(request),
        emailId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(original, 200);
    } catch (error) {
      const sharedAccountResponse = sharedAccountErrorResponse(error);
      if (sharedAccountResponse) return sharedAccountResponse;
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
  };
}
