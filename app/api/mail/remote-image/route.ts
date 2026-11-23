import {
  getAuthenticatedOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { fetchRemoteImage } from "@/lib/mail/remote-image-fetch.mts";
import { createRemoteImageHandler } from "@/lib/mail/remote-image-route.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export const GET = createRemoteImageHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  fetchImage: (url) => fetchRemoteImage(url),
});
