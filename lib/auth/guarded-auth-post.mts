export { isTrustedAppOrigin as isTrustedLogoutOrigin } from "./trusted-origin.mts";

/**
 * Auth.js answers failed callbacks with Response.redirect(), whose headers are
 * immutable, so headers are applied to a copy rather than the original.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(LOGOUT_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const LOGOUT_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

interface GuardedAuthPostDependencies {
  authPost(request: Request): Promise<Response>;
  getSessionId(request: Request): Promise<string | null>;
  revokeSession(sessionId: string): Promise<void>;
  isTrustedOrigin(request: Request): boolean;
}

export function isAuthSignOutRequest(request: Request): boolean {
  return new URL(request.url).pathname === "/api/auth/signout";
}

function failureResponse(status: 403 | 503, message: string): Response {
  return Response.json(
    { error: message },
    { status, headers: LOGOUT_RESPONSE_HEADERS },
  );
}

export async function handleGuardedAuthPost(
  request: Request,
  dependencies: GuardedAuthPostDependencies,
): Promise<Response> {
  if (!isAuthSignOutRequest(request)) {
    return withSecurityHeaders(await dependencies.authPost(request));
  }

  if (!dependencies.isTrustedOrigin(request)) {
    return failureResponse(403, "The logout request origin is not allowed.");
  }

  try {
    const sessionId = await dependencies.getSessionId(request);
    if (sessionId) await dependencies.revokeSession(sessionId);
  } catch {
    // Keep the Auth.js cookie so the user can retry while the row is still live.
    return failureResponse(
      503,
      "Logout is temporarily unavailable. Please retry.",
    );
  }

  return withSecurityHeaders(await dependencies.authPost(request));
}
