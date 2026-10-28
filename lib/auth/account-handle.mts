import { createHash } from "node:crypto";

/** Sent by the browser so a stale tab cannot act as an account it did not load. */
export const ACCOUNT_HANDLE_HEADER = "x-rekad-account";

/** A short public label for a session. It reveals nothing usable about the session id. */
export function accountHandle(sessionId: string): string {
  return createHash("sha256")
    .update(`rekad-account-handle:${sessionId}`)
    .digest("hex")
    .slice(0, 16);
}

/** True when the request names a different account than the one its cookie holds. */
export function accountHandleMismatch(request: Request, sessionId: string): boolean {
  const claimed = request.headers.get(ACCOUNT_HANDLE_HEADER);
  return claimed !== null && claimed !== accountHandle(sessionId);
}
