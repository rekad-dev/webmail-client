import { createProfilePictureHandlers } from "@/lib/profile/profile-picture-route.mts";
import { profilePictureDependencies } from "@/lib/profile/profile-picture-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createProfilePictureHandlers(profilePictureDependencies).VERSIONS;
