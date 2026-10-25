import {
  getAuthenticatedOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { createUserBannerGetHandler } from "@/lib/mail/managed-banner-route.mts";
import { getManagedMailBanners } from "@/lib/mail/managed-banner-store.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createUserBannerGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  getBanners: getManagedMailBanners,
});
