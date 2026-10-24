import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthComposePreflight } from "@/lib/jmap/client.mts";
import { createMailIdentitiesGetHandler } from "@/lib/jmap/mail-identities-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMailIdentitiesGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getComposePreflight: runJmapOAuthComposePreflight,
  getJmapSettings,
});
