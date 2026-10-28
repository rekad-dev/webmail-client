import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthMailAccounts } from "@/lib/jmap/client.mts";
import { createMailAccountsGetHandler } from "@/lib/jmap/mail-accounts-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMailAccountsGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  listAccounts: runJmapOAuthMailAccounts,
  getJmapSettings,
});
