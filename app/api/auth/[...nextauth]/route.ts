import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { revokeOAuthSession } from "@/lib/auth/session-store.mts";
import {
  handleGuardedAuthPost,
  isTrustedLogoutOrigin,
  withSecurityHeaders,
} from "@/lib/auth/guarded-auth-post.mts";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  return withSecurityHeaders(await handlers.GET(request));
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuardedAuthPost(request, {
    authPost: handlers.POST,
    getSessionId: getRequestOAuthSessionId,
    revokeSession: revokeOAuthSession,
    isTrustedOrigin: isTrustedLogoutOrigin,
  });
}
