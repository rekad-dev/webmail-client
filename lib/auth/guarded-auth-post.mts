export { isTrustedAppOrigin as isTrustedLogoutOrigin } from "./trusted-origin.mts";

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
    const response = await dependencies.authPost(request);
    for (const [name, value] of Object.entries(LOGOUT_RESPONSE_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
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

  const response = await dependencies.authPost(request);
  for (const [name, value] of Object.entries(LOGOUT_RESPONSE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}
