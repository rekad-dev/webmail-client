import { JmapAccountMismatchError } from "./client.mts";
import type { AuthorizedMailAccount } from "./account-scope.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type AccountsOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthMailAccounts
>[0];

export interface MailAccountsRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(
    sessionId: string,
  ): Promise<{ accessToken: string; accountId: string } | null>;
  revokeSession(sessionId: string): Promise<void>;
  listAccounts(options: AccountsOptions): Promise<AuthorizedMailAccount[]>;
  getJmapSettings(): Pick<
    AccountsOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

/** Returns shared (group) accounts only; the user's own account is implicit. */
export function createMailAccountsGetHandler(dependencies: MailAccountsRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
      const accounts = await dependencies.listAccounts({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(
        {
          sharedAccounts: accounts
            .filter((account) => !account.isPrimary)
            .map(({ id, name, isReadOnly }) => ({ id, name, isReadOnly })),
        },
        200,
      );
    } catch (error) {
      if (error instanceof JmapAccountMismatchError && sessionId) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
