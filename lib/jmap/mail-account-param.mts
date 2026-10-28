import {
  JmapSharedAccountReadOnlyError,
  JmapSharedAccountUnavailableError,
} from "./client.mts";

/**
 * Reads the optional `accountId` query parameter that selects a shared mail
 * account. It is only a request to use that account: the JMAP layer checks it
 * against the live session on every call. A repeated parameter becomes an
 * empty id, which can never be authorized.
 */
export function mailAccountOption(request: Request): { mailAccountId?: string } {
  const values = new URL(request.url).searchParams.getAll("accountId");
  if (values.length === 0) return {};
  return { mailAccountId: values.length === 1 ? values[0] : "" };
}

/** A revoked or unknown shared account must not end the user's own session. */
export function sharedAccountErrorResponse(error: unknown): Response | null {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (error instanceof JmapSharedAccountUnavailableError) {
    return Response.json({ error: "account_not_found" }, { status: 404, headers });
  }
  if (error instanceof JmapSharedAccountReadOnlyError) {
    return Response.json({ error: "account_read_only" }, { status: 403, headers });
  }
  return null;
}
