import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { getOAuthSessionSummary } from "@/lib/auth/session-store.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { createProfilePictureHandlers } from "@/lib/profile/profile-picture-route.mts";
import {
  deleteProfilePicture,
  getProfilePicture,
  saveProfilePicture,
} from "@/lib/profile/profile-picture-store.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createProfilePictureHandlers({
  getSessionId: getRequestOAuthSessionId,
  getSessionSummary: getOAuthSessionSummary,
  isTrustedOrigin: isTrustedAppOrigin,
  getPicture: getProfilePicture,
  savePicture: saveProfilePicture,
  deletePicture: deleteProfilePicture,
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
