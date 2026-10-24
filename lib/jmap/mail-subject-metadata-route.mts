import {
  JmapAccountMismatchError,
  JmapThreadSubjectSearchIncompleteError,
  type JmapSubjectMatchMetadata,
} from "./client.mts";
import {
  InvalidThreadSubjectsRequest,
  OversizedThreadSubjectsRequest,
  parseThreadSubjectsRequest,
} from "./mail-thread-subjects-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type SubjectMetadataOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthSubjectMatchMetadata
>[0];

export interface MailSubjectMetadataSession {
  accessToken: string;
  accountId: string;
}

export interface MailSubjectMetadataRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailSubjectMetadataSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getSubjectMetadata(options: SubjectMetadataOptions): Promise<JmapSubjectMatchMetadata>;
  isTrustedOrigin(request: Request): boolean;
  getJmapSettings(): Pick<
    SubjectMetadataOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}

export function createMailSubjectMetadataPostHandler(
  dependencies: MailSubjectMetadataRouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (!contentTypeIsJson(request)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let subject: string;
    try {
      subject = await parseThreadSubjectsRequest(request);
    } catch (error) {
      if (error instanceof OversizedThreadSubjectsRequest) {
        return jsonResponse({ error: "request_too_large" }, 413);
      }
      if (error instanceof InvalidThreadSubjectsRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);

      const result = await dependencies.getSubjectMetadata({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        subject,
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
      if (error instanceof JmapThreadSubjectSearchIncompleteError) {
        return jsonResponse({ error: "subject_search_incomplete" }, 422);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
