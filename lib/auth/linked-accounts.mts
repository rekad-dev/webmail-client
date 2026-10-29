import { accountHandle, accountHandleMismatch } from "./account-handle.mts";
import { APP_SESSION_MAX_AGE_SECONDS } from "./session-policy.mts";

export const MAX_LINKED_ACCOUNTS = 4;
export const LINKED_ACCOUNTS_MAX_AGE_SECONDS = APP_SESSION_MAX_AGE_SECONDS;
export const ADD_ACCOUNT_INTENT_MAX_AGE_SECONDS = 10 * 60;

const prefix = process.env.NODE_ENV === "production" ? "__Host-" : "";
export const LINKED_ACCOUNTS_COOKIE_NAME = `${prefix}rekad.accounts`;
export const ADD_ACCOUNT_INTENT_COOKIE_NAME = `${prefix}rekad.add-account`;

// An Auth.js session token is a five-part compact JWE; entries are joined with "~".
const SESSION_TOKEN = /^[A-Za-z0-9_-]{1,1200}(\.[A-Za-z0-9_-]{0,1200}){4}$/;
const HANDLE = /^[0-9a-f]{16}$/;
const LABEL_MAX_LENGTH = 200;

/** A linked session as stored in the browser: its token plus the handle and label it had while valid. */
export interface LinkedRecord {
  token: string;
  handle: string | null;
  label: string | null;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function decodeLabel(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(value)) return null;
  const label = Buffer.from(value, "base64url").toString("utf8").slice(0, LABEL_MAX_LENGTH);
  return label || null;
}

/** Each entry is `token|handle|base64url(label)`; the handle and label may be empty for older cookies. */
export function parseLinkedRecords(value: string | null): LinkedRecord[] {
  if (!value) return [];
  const records: LinkedRecord[] = [];
  for (const part of value.split("~")) {
    const [token, handleValue = "", labelValue = ""] = part.split("|");
    if (!SESSION_TOKEN.test(token) || records.some((record) => record.token === token)) continue;
    records.push({
      token,
      handle: HANDLE.test(handleValue) ? handleValue : null,
      label: decodeLabel(labelValue),
    });
    if (records.length === MAX_LINKED_ACCOUNTS) break;
  }
  return records;
}

export function parseLinkedTokens(value: string | null): string[] {
  return parseLinkedRecords(value).map((record) => record.token);
}

export function serializeLinkedRecords(records: LinkedRecord[]): string {
  return records
    .slice(0, MAX_LINKED_ACCOUNTS)
    .map((record) => [
      record.token,
      record.handle ?? "",
      record.label ? Buffer.from(record.label, "utf8").toString("base64url") : "",
    ].join("|"))
    .join("~");
}

export function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure = process.env.NODE_ENV === "production",
): string {
  return [
    `${name}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    ...(secure ? ["Secure"] : []),
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ].join("; ");
}

export function deleteCookie(name: string, secure = process.env.NODE_ENV === "production"): string {
  return serializeCookie(name, "", 0, secure);
}

export interface LinkedAccountsDependencies {
  authCookieName: string;
  /** Returns the app session id inside an Auth.js session token, or null when it is invalid. */
  decodeSessionToken(token: string): Promise<string | null>;
  getSessionSummary(sessionId: string): Promise<{ subject: string; expiresAt: Date } | null>;
  revokeSession(sessionId: string): Promise<void>;
  getAccountLabel(sessionId: string): Promise<string | null>;
  /** The address and version of a person's profile picture, when they have one. */
  getPictureEntry?(subject: string): Promise<{ email: string | null; version: number } | null>;
  isTrustedOrigin(request: Request): boolean;
  now?(): number;
}

interface LinkedEntry {
  token: string;
  sessionId: string;
  subject: string;
  expiresAt: Date;
  handle: string;
  label: string | null;
}

/** A linked account whose session has ended. It stays listed, marked as logged out, until the user adds an account. */
interface LapsedAccount {
  token: string;
  handle: string;
  label: string;
}

interface LinkedState {
  entries: LinkedEntry[];
  active: LinkedEntry | null;
  lapsed: LapsedAccount[];
  /** Sessions replaced by a newer login of the same person; they must be revoked. */
  superseded: string[];
  hadIntent: boolean;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function respond(body: unknown, status: number, cookies: string[] = []): Response {
  const headers = new Headers(RESPONSE_HEADERS);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return null;
  }
  try {
    const text = await request.text();
    if (text.length > 1024) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function createLinkedAccountsHandlers(deps: LinkedAccountsDependencies) {
  async function resolveEntry(token: string): Promise<LinkedEntry | null> {
    const sessionId = await deps.decodeSessionToken(token).catch(() => null);
    if (!sessionId) return null;
    const summary = await deps.getSessionSummary(sessionId);
    if (!summary) return null;
    return {
      token,
      sessionId,
      subject: summary.subject,
      expiresAt: summary.expiresAt,
      handle: accountHandle(sessionId),
      label: null,
    };
  }

  /**
   * Merge the browser's linked sessions with the active one. Only entries whose
   * server-side session is still valid survive. The active session joins the
   * list only right after the user asked to add an account.
   */
  async function loadState(request: Request): Promise<LinkedState> {
    const activeToken = readCookie(request, deps.authCookieName);
    const active = activeToken ? await resolveEntry(activeToken) : null;
    const hadIntent = readCookie(request, ADD_ACCOUNT_INTENT_COOKIE_NAME) === "1";

    const entries: LinkedEntry[] = [];
    const lapsedAccounts: LapsedAccount[] = [];
    for (const record of parseLinkedRecords(readCookie(request, LINKED_ACCOUNTS_COOKIE_NAME))) {
      const entry = await resolveEntry(record.token);
      if (entry) {
        entries.push({ ...entry, label: record.label });
      } else if (record.handle && record.label) {
        lapsedAccounts.push({ token: record.token, handle: record.handle, label: record.label });
      }
    }

    const superseded: string[] = [];
    let current = active;
    if (active) {
      const index = entries.findIndex((entry) => entry.sessionId === active.sessionId);
      if (index !== -1) {
        entries[index] = { ...active, label: entries[index].label }; // keep the freshest token
      } else if (hadIntent || entries.length === 0) {
        // A person who signs in again replaces their older session instead of duplicating it.
        const sameSubject = entries.findIndex((entry) => entry.subject === active.subject);
        if (sameSubject !== -1) {
          superseded.push(entries[sameSubject].sessionId);
          entries.splice(sameSubject, 1);
        }
        entries.push({ ...active, label: null });
      }
    }
    // Never exceed the cap; the active session always stays.
    while (entries.length > MAX_LINKED_ACCOUNTS) {
      const drop = entries.findIndex((entry) => entry.sessionId !== current?.sessionId);
      superseded.push(entries[drop].sessionId);
      entries.splice(drop, 1);
    }
    // Lapsed accounts only take the room that valid accounts leave free.
    const lapsed = lapsedAccounts.slice(0, Math.max(0, MAX_LINKED_ACCOUNTS - entries.length));
    return { entries, active: current, lapsed, superseded, hadIntent };
  }

  function linkedCookie(entries: LinkedEntry[], lapsed: LapsedAccount[] = []): string[] {
    const records: LinkedRecord[] = [
      ...entries.map((entry) => ({ token: entry.token, handle: entry.handle, label: entry.label })),
      ...lapsed,
    ];
    return records.length > 1
      ? [serializeCookie(LINKED_ACCOUNTS_COOKIE_NAME, serializeLinkedRecords(records), LINKED_ACCOUNTS_MAX_AGE_SECONDS)]
      : [deleteCookie(LINKED_ACCOUNTS_COOKIE_NAME)];
  }

  async function revokeAll(sessionIds: string[]): Promise<boolean> {
    try {
      for (const sessionId of sessionIds) await deps.revokeSession(sessionId);
      return true;
    } catch {
      return false;
    }
  }

  function sessionCookie(entry: LinkedEntry): string {
    const seconds = (entry.expiresAt.getTime() - (deps.now?.() ?? Date.now())) / 1000;
    return serializeCookie(deps.authCookieName, entry.token, Math.min(LINKED_ACCOUNTS_MAX_AGE_SECONDS, seconds));
  }

  async function GET(request: Request): Promise<Response> {
    try {
      const state = await loadState(request);
      if (!state.active) return respond({ error: "sign_in_required" }, 401);
      if (state.superseded.length && !(await revokeAll(state.superseded))) {
        return respond({ error: "mail_unavailable" }, 503);
      }
      const list = state.entries.some((entry) => entry.sessionId === state.active?.sessionId)
        ? state.entries
        : [state.active];
      // labels=0 only reconciles the list (cheap) and reuses the stored labels, so the menu opens with names at once.
      const withLabels = new URL(request.url).searchParams.get("labels") !== "0";
      const resolved = await Promise.all(
        list.map(async (entry) => {
          const fresh = withLabels ? await deps.getAccountLabel(entry.sessionId).catch(() => null) : null;
          // A missing table or database error only means initials are shown instead.
          const picture = await deps.getPictureEntry?.(entry.subject).catch(() => null) ?? null;
          return { entry, label: fresh ?? entry.label, picture };
        }),
      );
      for (const { entry, label } of resolved) entry.label = label;
      const cookies = [...linkedCookie(state.entries, state.lapsed)];
      if (state.hadIntent) cookies.push(deleteCookie(ADD_ACCOUNT_INTENT_COOKIE_NAME));
      const accounts = [
        ...resolved.map(({ entry, label, picture }) => ({
          handle: entry.handle,
          label: label ?? "Account",
          active: entry.sessionId === state.active?.sessionId,
          // Only the address and version are listed; the image itself is fetched, and cached, separately.
          ...(picture?.email ? { pictureAddress: picture.email, pictureVersion: picture.version } : {}),
        })),
        ...state.lapsed.map((account) => ({ handle: account.handle, label: account.label, active: false, lapsed: true })),
      ];
      return respond({ accounts, canAdd: list.length < MAX_LINKED_ACCOUNTS }, 200, cookies);
    } catch {
      return respond({ error: "mail_unavailable" }, 503);
    }
  }

  async function POST_add(request: Request): Promise<Response> {
    if (!deps.isTrustedOrigin(request)) return respond({ error: "origin_not_allowed" }, 403);
    try {
      const state = await loadState(request);
      if (!state.active) return respond({ error: "sign_in_required" }, 401);
      if (accountHandleMismatch(request, state.active.sessionId)) return respond({ error: "account_changed" }, 409);
      const entries = state.entries.some((entry) => entry.sessionId === state.active?.sessionId)
        ? state.entries
        : [...state.entries, state.active];
      if (entries.length >= MAX_LINKED_ACCOUNTS) return respond({ error: "account_limit" }, 409);
      // Adding an account replaces the logged-out marks, so the new account always has room.
      return respond({ ok: true }, 200, [
        serializeCookie(LINKED_ACCOUNTS_COOKIE_NAME, serializeLinkedRecords(entries.map((entry) => ({ token: entry.token, handle: entry.handle, label: entry.label }))), LINKED_ACCOUNTS_MAX_AGE_SECONDS),
        serializeCookie(ADD_ACCOUNT_INTENT_COOKIE_NAME, "1", ADD_ACCOUNT_INTENT_MAX_AGE_SECONDS),
      ]);
    } catch {
      return respond({ error: "mail_unavailable" }, 503);
    }
  }

  async function POST_switch(request: Request): Promise<Response> {
    if (!deps.isTrustedOrigin(request)) return respond({ error: "origin_not_allowed" }, 403);
    const body = await readJsonBody(request);
    if (!body || typeof body.handle !== "string" || !/^[0-9a-f]{16}$/.test(body.handle)) {
      return respond({ error: "invalid_request" }, 400);
    }
    try {
      const state = await loadState(request);
      if (!state.active) return respond({ error: "sign_in_required" }, 401);
      const target = state.entries.find((entry) => entry.handle === body.handle);
      if (!target) {
        if (state.lapsed.some((account) => account.handle === body.handle)) return respond({ error: "account_logged_out" }, 409);
        return respond({ error: "account_not_found" }, 404);
      }
      if (state.superseded.length && !(await revokeAll(state.superseded))) {
        return respond({ error: "mail_unavailable" }, 503);
      }
      return respond({ ok: true }, 200, [...linkedCookie(state.entries, state.lapsed), sessionCookie(target)]);
    } catch {
      return respond({ error: "mail_unavailable" }, 503);
    }
  }

  /**
   * Remove one account (by handle), the active one (default) or every account.
   * Removing revokes the server-side session. If the active account goes and
   * another remains, the browser continues as that account.
   */
  async function POST_remove(request: Request): Promise<Response> {
    if (!deps.isTrustedOrigin(request)) return respond({ error: "origin_not_allowed" }, 403);
    const body = await readJsonBody(request);
    if (!body) return respond({ error: "invalid_request" }, 400);
    if (
      (body.handle !== undefined && (typeof body.handle !== "string" || !/^[0-9a-f]{16}$/.test(body.handle))) ||
      (body.all !== undefined && body.all !== true)
    ) {
      return respond({ error: "invalid_request" }, 400);
    }
    try {
      const state = await loadState(request);
      const activeId = state.active?.sessionId ?? null;
      // A tab left open across an account switch must not sign out the new account.
      if (
        state.active &&
        body.handle === undefined &&
        body.all !== true &&
        accountHandleMismatch(request, state.active.sessionId)
      ) {
        return respond({ error: "account_changed" }, 409);
      }
      const known = new Map<string, LinkedEntry>();
      for (const entry of state.entries) known.set(entry.sessionId, entry);
      if (state.active) known.set(state.active.sessionId, state.active);

      let removeIds: string[];
      if (body.all === true) {
        removeIds = [...known.keys()];
      } else if (typeof body.handle === "string") {
        const target = [...known.values()].find((entry) => entry.handle === body.handle);
        if (!target) return respond({ error: "account_not_found" }, 404);
        removeIds = [target.sessionId];
      } else {
        removeIds = activeId ? [activeId] : [];
      }

      // Revoke first so a failure leaves the cookies (and the session) intact for a retry.
      if (!(await revokeAll([...removeIds, ...state.superseded]))) {
        return respond({ error: "mail_unavailable" }, 503);
      }
      const kept = state.entries.filter((entry) => !removeIds.includes(entry.sessionId));
      const activeKept = state.active !== null && !removeIds.includes(state.active.sessionId);
      if (activeKept && !kept.some((entry) => entry.sessionId === state.active?.sessionId)) {
        kept.push(state.active as LinkedEntry);
      }
      const nextActive = activeKept ? (state.active as LinkedEntry) : (kept[0] ?? null);
      // "Sign out of all" clears logged-out marks too; they only survive while another account is signed in.
      const keptLapsed = body.all === true || !nextActive ? [] : state.lapsed;
      const cookies: string[] = [...linkedCookie(kept, keptLapsed)];
      if (nextActive) {
        if (nextActive.sessionId !== activeId) cookies.push(sessionCookie(nextActive));
      } else {
        cookies.push(deleteCookie(deps.authCookieName));
      }
      cookies.push(deleteCookie(ADD_ACCOUNT_INTENT_COOKIE_NAME));
      return respond({ ok: true, remaining: nextActive ? kept.length : 0 }, 200, cookies);
    } catch {
      return respond({ error: "mail_unavailable" }, 503);
    }
  }

  return { GET, POST_add, POST_switch, POST_remove };
}
