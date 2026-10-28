import {
  getAuthenticatedOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { createUserBannerGetHandler } from "@/lib/mail/managed-banner-route.mts";
import { getFixedMailBanners } from "@/lib/mail/fixed-mail-banners.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createUserBannerGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  getBanners: async () => getFixedMailBanners(),
});
