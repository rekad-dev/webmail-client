import {
  getAuthenticatedOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { createAdminBannerHandlers } from "@/lib/mail/managed-banner-route.mts";
import {
  getManagedMailBanners,
  isManagedBannerAdmin,
  saveManagedMailBanners,
} from "@/lib/mail/managed-banner-store.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAdminBannerHandlers({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  isAdmin: isManagedBannerAdmin,
  isTrustedOrigin: isTrustedAppOrigin,
  getBanners: getManagedMailBanners,
  saveBanners: saveManagedMailBanners,
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
