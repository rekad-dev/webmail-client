import assert from "node:assert/strict";
import test from "node:test";

import { ACCOUNT_HANDLE_HEADER, accountHandle, accountHandleMismatch } from "../lib/auth/account-handle.mts";
import { createOAuthSessionCallback } from "../lib/auth/session-callback.mts";

test("handles are short, stable and do not contain the session id", () => {
  const sessionId = "a".repeat(43);
  assert.match(accountHandle(sessionId), /^[0-9a-f]{16}$/);
  assert.equal(accountHandle(sessionId), accountHandle(sessionId));
  assert.notEqual(accountHandle(sessionId), accountHandle("b".repeat(43)));
});

test("a request is a mismatch only when it names a different account", () => {
  const sessionId = "a".repeat(43);
  const withHeader = (value?: string) =>
    new Request("https://webmail.rekad.id/api/mail", value === undefined ? {} : { headers: { [ACCOUNT_HANDLE_HEADER]: value } });
  assert.equal(accountHandleMismatch(withHeader(), sessionId), false);
  assert.equal(accountHandleMismatch(withHeader(accountHandle(sessionId)), sessionId), false);
  assert.equal(accountHandleMismatch(withHeader(accountHandle("b".repeat(43))), sessionId), true);
  assert.equal(accountHandleMismatch(withHeader(""), sessionId), true);
});

test("the session exposes the handle of its server-side session", async () => {
  const callback = createOAuthSessionCallback(async () => ({ subject: "s", expiresAt: new Date("2030-01-01") }));
  const result = await callback({ session: { expires: "x", user: {} } as never, token: { sid: "a".repeat(43) } as never });
  assert.equal(result.accountHandle, accountHandle("a".repeat(43)));
});
