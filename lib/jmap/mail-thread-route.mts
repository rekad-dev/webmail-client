import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  type JmapThreadView,
} from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type ThreadOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthThreadView
>[0];

export interface MailThreadSession {
  accessToken: string;
  accountId: string;
}

export interface MailThreadRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailThreadSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getThread(options: ThreadOptions): Promise<JmapThreadView>;
  getJmapSettings(): Pick<
    ThreadOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function readThreadId(request: Request): string {
  const values = new URL(request.url).searchParams.getAll("threadId");
  const id = values[0];
  if (
    values.length !== 1 ||
    !id ||
    id.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(id)
  ) {
    throw new Error("invalid_thread_id");
  }
  return id;
}

export function createMailThreadGetHandler(
  dependencies: MailThreadRouteDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    let threadId: string;
    try {
      threadId = readThreadId(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);

      const thread = await dependencies.getThread({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        threadId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(thread, 200);
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
        return jsonResponse({ error: "thread_not_found" }, 404);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
