import { createProfilePictureHandlers } from "@/lib/profile/profile-picture-route.mts";
import { profilePictureDependencies } from "@/lib/profile/profile-picture-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createProfilePictureHandlers(profilePictureDependencies);

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
