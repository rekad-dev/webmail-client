import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthMailboxListing } from "@/lib/jmap/client.mts";
import { createMailGetHandler } from "@/lib/jmap/mail-route.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getJmapSettings() {
  return {
    sessionUrl:
      process.env.STALWART_JMAP_SESSION_URL ??
      "https://mail.rekad.id/.well-known/jmap",
    trustedOrigins: (
      process.env.STALWART_JMAP_TRUSTED_ORIGINS ?? "https://mail.rekad.id"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    allowInsecureHttp:
      process.env.STALWART_JMAP_ALLOW_INSECURE_HTTP === "true",
  };
}

export const GET = createMailGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  listMail: runJmapOAuthMailboxListing,
  getJmapSettings,
});
