import {
  JmapAccountMismatchError,
  JmapMailboxNotFoundError,
  type JmapMailboxListing,
} from "./client.mts";
import {
  InvalidMailListingRequest,
  parseMailListingRequest,
} from "./mail-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

type ListingOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthMailboxListing
>[0];

export interface MailRouteSession {
  accessToken: string;
  accountId: string;
}

export interface MailRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailRouteSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  listMail(options: ListingOptions): Promise<JmapMailboxListing>;
  getJmapSettings(): Pick<
    ListingOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export function createMailGetHandler(dependencies: MailRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    let listingRequest;
    try {
      listingRequest = parseMailListingRequest(
        new URL(request.url).searchParams,
      );
    } catch (error) {
      if (error instanceof InvalidMailListingRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) {
        return jsonResponse({ error: "sign_in_required" }, 401);
      }

      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) {
        return jsonResponse({ error: "sign_in_required" }, 401);
      }

      const listing = await dependencies.listMail({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...listingRequest,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(listing, 200);
    } catch (error) {
      if (error instanceof JmapAccountMismatchError) {
        if (!sessionId) {
          return jsonResponse({ error: "sign_in_required" }, 401);
        }
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      if (error instanceof JmapMailboxNotFoundError) {
        return jsonResponse({ error: "mailbox_not_found" }, 404);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
