import "server-only";

import { getAuthSession } from "@/auth";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { getOAuthSessionSummary } from "@/lib/auth/session-store.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import type { ProfilePictureRouteDependencies } from "./profile-picture-route.mts";
import {
  deleteProfilePicture,
  getProfilePicture,
  getProfilePictureByEmail,
  getProfilePictureVersionsByEmail,
  saveProfilePicture,
} from "./profile-picture-store.mts";

/** Shared by the picture and picture-lookup routes so both authorize the same way. */
export const profilePictureDependencies: ProfilePictureRouteDependencies = {
  getSessionId: getRequestOAuthSessionId,
  getSessionSummary: getOAuthSessionSummary,
  isTrustedOrigin: isTrustedAppOrigin,
  getPicture: getProfilePicture,
  getPictureByAddress: getProfilePictureByEmail,
  getVersionsByAddress: getProfilePictureVersionsByEmail,
  async getSessionAddress(_request, subject) {
    // The address comes from the verified sign-in, never from the request.
    const session = await getAuthSession();
    return session?.user?.id === subject && typeof session.user.email === "string"
      ? session.user.email
      : null;
  },
  savePicture: saveProfilePicture,
  deletePicture: deleteProfilePicture,
};
