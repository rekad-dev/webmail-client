import assert from "node:assert/strict";
import test from "node:test";

import { accountHandle } from "../lib/auth/account-handle.mts";
import {
  ADD_ACCOUNT_INTENT_COOKIE_NAME,
  createLinkedAccountsHandlers,
  LINKED_ACCOUNTS_COOKIE_NAME,
  MAX_LINKED_ACCOUNTS,
  parseLinkedTokens,
  type LinkedAccountsDependencies,
} from "../lib/auth/linked-accounts.mts";

const AUTH = "authjs.session-token";
// Token t<N> is a five-part JWE-shaped string that maps to session s<N>.
const token = (n: number) => `h${n}.k${n}.i${n}.c${n}.t${n}`;
const handle = (n: number) => accountHandle(`s${n}`);

function setup(options: { valid?: number[]; failRevoke?: boolean } = {}) {
  const valid = new Set(options.valid ?? [1, 2, 3, 4, 5, 6, 101]);
  const revoked: string[] = [];
  const deps: LinkedAccountsDependencies = {
    authCookieName: AUTH,
    decodeSessionToken: async (value) => {
      const match = /^h(\d+)\./.exec(value);
      return match ? `s${match[1]}` : null;
    },
    getSessionSummary: async (sessionId) => {
      const n = Number(sessionId.slice(1));
      return valid.has(n) && !revoked.includes(sessionId)
        ? { subject: `subject-${n % 100}`, expiresAt: new Date(Date.now() + 3_600_000) }
        : null;
    },
    revokeSession: async (sessionId) => {
      if (options.failRevoke) throw new Error("db down");
      revoked.push(sessionId);
    },
    getAccountLabel: async (sessionId) => `user-${sessionId.slice(1)}@rekad.id`,
    isTrustedOrigin: (request) => request.headers.get("origin") === "https://webmail.rekad.id",
  };
  return { handlers: createLinkedAccountsHandlers(deps), revoked };
}

function request(path: string, active: number | null, linked: number[] = [], extra: { body?: unknown; intent?: boolean; origin?: string | null } = {}) {
  const cookies = [
    active !== null ? `${AUTH}=${token(active)}` : null,
    linked.length ? `${LINKED_ACCOUNTS_COOKIE_NAME}=${linked.map(token).join("~")}` : null,
    extra.intent ? `${ADD_ACCOUNT_INTENT_COOKIE_NAME}=1` : null,
  ].filter(Boolean).join("; ");
  const headers: Record<string, string> = { cookie: cookies, "content-type": "application/json" };
  if (extra.origin !== null) headers.origin = extra.origin ?? "https://webmail.rekad.id";
  return new Request(`https://webmail.rekad.id${path}`, {
    method: extra.body === undefined ? "GET" : "POST",
    headers,
    ...(extra.body === undefined ? {} : { body: JSON.stringify(extra.body) }),
  });
}

const setCookies = (response: Response) => response.headers.getSetCookie();
const cookieNamed = (response: Response, name: string) => setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));

test("rejects malformed and duplicate linked tokens and caps the count", () => {
  const tokens = [1, 2, 3, 4, 5, 6].map(token);
  assert.equal(parseLinkedTokens(tokens.join("~")).length, MAX_LINKED_ACCOUNTS);
  assert.deepEqual(parseLinkedTokens(`${token(1)}~${token(1)}~not-a-token~a.b.c`), [token(1)]);
  assert.deepEqual(parseLinkedTokens(null), []);
});

test("lists linked accounts with opaque handles and marks the active one", async () => {
  const { handlers } = setup();
  const response = await handlers.GET(request("/api/account/linked", 1, [1, 2]));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.accounts, [
    { handle: handle(1), label: "user-1@rekad.id", active: true },
    { handle: handle(2), label: "user-2@rekad.id", active: false },
  ]);
  assert.equal(body.canAdd, true);
  assert.doesNotMatch(JSON.stringify(body), /s1|h1\./);
});

test("requires a valid active session and drops dead linked sessions", async () => {
  const { handlers } = setup({ valid: [1, 3] });
  assert.equal((await handlers.GET(request("/api/account/linked", null, [1, 3]))).status, 401);
  const response = await handlers.GET(request("/api/account/linked", 1, [1, 2, 3]));
  assert.deepEqual((await response.json()).accounts.map((account: { handle: string }) => account.handle), [handle(1), handle(3)]);
});

test("a newly signed-in session joins only after an add-account request", async () => {
  const { handlers } = setup();
  const plain = await (await handlers.GET(request("/api/account/linked", 3, [1, 2]))).json();
  assert.deepEqual(plain.accounts.map((account: { active: boolean }) => account.active), [true]);

  const joined = await handlers.GET(request("/api/account/linked", 3, [1, 2], { intent: true }));
  assert.equal((await joined.json()).accounts.length, 3);
  assert.match(cookieNamed(joined, LINKED_ACCOUNTS_COOKIE_NAME) ?? "", new RegExp(token(3)));
  assert.match(cookieNamed(joined, ADD_ACCOUNT_INTENT_COOKIE_NAME) ?? "", /Max-Age=0/);
});

test("signing in again as the same person replaces and revokes the older session", async () => {
  const { handlers, revoked } = setup();
  // s101 and s1 share subject-1.
  const first = request("/api/account/linked", 101, [1, 2], { intent: true });
  const response = await handlers.GET(first);
  assert.deepEqual((await response.json()).accounts.map((account: { handle: string }) => account.handle), [handle(2), handle(101)]);
  assert.deepEqual(revoked, ["s1"]);
});

test("add requires a trusted origin, a session, and room", async () => {
  const { handlers } = setup();
  assert.equal((await handlers.POST_add(request("/api/account/add", 1, [], { body: {}, origin: null }))).status, 403);
  assert.equal((await handlers.POST_add(request("/api/account/add", null, [], { body: {} }))).status, 401);
  assert.equal((await handlers.POST_add(request("/api/account/add", 1, [1, 2, 3, 4], { body: {} }))).status, 409);

  const ok = await handlers.POST_add(request("/api/account/add", 1, [], { body: {} }));
  assert.equal(ok.status, 200);
  assert.match(cookieNamed(ok, LINKED_ACCOUNTS_COOKIE_NAME) ?? "", new RegExp(token(1)));
  assert.match(cookieNamed(ok, ADD_ACCOUNT_INTENT_COOKIE_NAME) ?? "", /=1;/);
  for (const cookie of setCookies(ok)) assert.match(cookie, /HttpOnly; SameSite=Lax; Path=\//);
});

test("switch only activates a linked, still-valid account", async () => {
  const { handlers } = setup({ valid: [1, 2] });
  const ok = await handlers.POST_switch(request("/api/account/switch", 1, [1, 2], { body: { handle: handle(2) } }));
  assert.equal(ok.status, 200);
  assert.match(cookieNamed(ok, AUTH) ?? "", new RegExp(token(2)));

  for (const body of [{ handle: handle(9) }, { handle: handle(3) }]) {
    const missing = await handlers.POST_switch(request("/api/account/switch", 1, [1, 2], { body }));
    assert.equal(missing.status, 404);
    assert.equal(cookieNamed(missing, AUTH), undefined);
  }
  for (const body of [{}, { handle: "../../etc" }, { handle: 5 }]) {
    assert.equal((await handlers.POST_switch(request("/api/account/switch", 1, [1, 2], { body }))).status, 400);
  }
  assert.equal((await handlers.POST_switch(request("/api/account/switch", 1, [1, 2], { body: { handle: handle(2) }, origin: "https://evil.example" }))).status, 403);
});

test("a revoked account cannot be switched to", async () => {
  const { handlers } = setup({ valid: [1] });
  const response = await handlers.POST_switch(request("/api/account/switch", 1, [1, 2], { body: { handle: handle(2) } }));
  assert.equal(response.status, 404);
});

test("removing the active account revokes it and continues as another", async () => {
  const { handlers, revoked } = setup();
  const response = await handlers.POST_remove(request("/api/account/remove", 1, [1, 2], { body: {} }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, remaining: 1 });
  assert.deepEqual(revoked, ["s1"]);
  assert.match(cookieNamed(response, AUTH) ?? "", new RegExp(token(2)));
});

test("removing the last account clears the browser", async () => {
  const { handlers, revoked } = setup();
  const response = await handlers.POST_remove(request("/api/account/remove", 1, [], { body: {} }));
  assert.deepEqual(await response.json(), { ok: true, remaining: 0 });
  assert.deepEqual(revoked, ["s1"]);
  assert.match(cookieNamed(response, AUTH) ?? "", /Max-Age=0/);
});

test("sign out of all revokes every linked session", async () => {
  const { handlers, revoked } = setup();
  const response = await handlers.POST_remove(request("/api/account/remove", 1, [1, 2, 3], { body: { all: true } }));
  assert.deepEqual((await response.json()).remaining, 0);
  assert.deepEqual(revoked.sort(), ["s1", "s2", "s3"]);
});

test("an expired active session moves to a remaining account", async () => {
  const { handlers, revoked } = setup({ valid: [2] });
  const response = await handlers.POST_remove(request("/api/account/remove", 1, [1, 2], { body: {} }));
  assert.deepEqual(await response.json(), { ok: true, remaining: 1 });
  assert.deepEqual(revoked, []);
  assert.match(cookieNamed(response, AUTH) ?? "", new RegExp(token(2)));
});

test("a failed revoke keeps the cookies so the user can retry", async () => {
  const { handlers } = setup({ failRevoke: true });
  const response = await handlers.POST_remove(request("/api/account/remove", 1, [1, 2], { body: {} }));
  assert.equal(response.status, 503);
  assert.deepEqual(setCookies(response), []);
});

test("remove rejects non-JSON or unexpected bodies and untrusted origins", async () => {
  const { handlers } = setup();
  assert.equal((await handlers.POST_remove(request("/api/account/remove", 1, [], { body: { all: "yes" } }))).status, 400);
  assert.equal((await handlers.POST_remove(request("/api/account/remove", 1, [], { body: {}, origin: null }))).status, 403);
  assert.equal((await handlers.POST_remove(request("/api/account/remove", 1, [1, 2], { body: { handle: handle(9) } }))).status, 404);
});

test("labels are skipped when only reconciling", async () => {
  const { handlers } = setup();
  const response = await handlers.GET(request("/api/account/linked?labels=0", 1, [1, 2]));
  assert.deepEqual((await response.json()).accounts.map((account: { label: string }) => account.label), ["Account", "Account"]);
});

test("a tab opened for another account cannot add or sign out the active one", async () => {
  const { handlers, revoked } = setup();
  const stale = (path: string, body: unknown) => {
    const base = request(path, 2, [1, 2], { body });
    const headers = new Headers(base.headers);
    headers.set("x-rekad-account", handle(1));
    return new Request(base.url, { method: "POST", headers, body: JSON.stringify(body) });
  };
  assert.equal((await handlers.POST_remove(stale("/api/account/remove", {}))).status, 409);
  assert.equal((await handlers.POST_add(stale("/api/account/add", {}))).status, 409);
  assert.deepEqual(revoked, []);
});
