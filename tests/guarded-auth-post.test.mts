import assert from "node:assert/strict";
import test from "node:test";

import {
  handleGuardedAuthPost,
  isAuthSignOutRequest,
  isTrustedLogoutOrigin,
} from "../lib/auth/guarded-auth-post.mts";

function request(path: string, origin?: string): Request {
  return new Request(`https://webmail.rekad.id${path}`, {
    method: "POST",
    ...(origin ? { headers: { origin } } : {}),
  });
}

test("identifies only the Auth.js signout action", () => {
  assert.equal(isAuthSignOutRequest(request("/api/auth/signout")), true);
  assert.equal(
    isAuthSignOutRequest(request("/api/auth/callback/stalwart")),
    false,
  );
  assert.equal(isAuthSignOutRequest(request("/api/auth/signout/")), false);
});

test("accepts the production app origin and loopback development origins", () => {
  assert.equal(
    isTrustedLogoutOrigin(
      request("/api/auth/signout", "https://webmail.rekad.id"),
      true,
    ),
    true,
  );
  assert.equal(
    isTrustedLogoutOrigin(
      request("/api/auth/signout", "http://localhost:3001"),
      false,
    ),
    true,
  );
  assert.equal(
    isTrustedLogoutOrigin(
      request("/api/auth/signout", "http://localhost:3001"),
      true,
    ),
    false,
  );
  assert.equal(
    isTrustedLogoutOrigin(
      request("/api/auth/signout", "https://admin-mail.rekad.id"),
      true,
    ),
    false,
  );
  assert.equal(isTrustedLogoutOrigin(request("/api/auth/signout"), true), false);
});

test("revokes the application session before Auth.js clears the cookie", async () => {
  const order: string[] = [];
  const response = await handleGuardedAuthPost(
    request("/api/auth/signout", "https://webmail.rekad.id"),
    {
      isTrustedOrigin: () => true,
      getSessionId: async () => {
        order.push("read-session");
        return "session-id";
      },
      revokeSession: async (sessionId) => {
        assert.equal(sessionId, "session-id");
        order.push("revoke-session");
      },
      authPost: async () => {
        order.push("authjs-signout");
        return new Response(null, { status: 302 });
      },
    },
  );

  assert.deepEqual(order, ["read-session", "revoke-session", "authjs-signout"]);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("keeps Auth.js from clearing the cookie when session revocation fails", async () => {
  let authPostCalled = false;
  const response = await handleGuardedAuthPost(
    request("/api/auth/signout", "https://webmail.rekad.id"),
    {
      isTrustedOrigin: () => true,
      getSessionId: async () => "session-id",
      revokeSession: async () => {
        throw new Error("database unavailable");
      },
      authPost: async () => {
        authPostCalled = true;
        return new Response(null, { status: 302 });
      },
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Logout is temporarily unavailable. Please retry.",
  });
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(authPostCalled, false);
});

test("does not delegate signout when the session cookie cannot be decoded", async () => {
  let authPostCalled = false;
  const response = await handleGuardedAuthPost(
    request("/api/auth/signout", "https://webmail.rekad.id"),
    {
      isTrustedOrigin: () => true,
      getSessionId: async () => {
        throw new Error("session decoding failed");
      },
      revokeSession: async () => undefined,
      authPost: async () => {
        authPostCalled = true;
        return new Response(null, { status: 302 });
      },
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(authPostCalled, false);
});

test("rejects cross-origin logout before reading or revoking a session", async () => {
  let called = false;
  const response = await handleGuardedAuthPost(
    request("/api/auth/signout", "https://attacker.example"),
    {
      isTrustedOrigin: () => false,
      getSessionId: async () => {
        called = true;
        return "session-id";
      },
      revokeSession: async () => {
        called = true;
      },
      authPost: async () => {
        called = true;
        return new Response(null, { status: 302 });
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("passes other Auth.js POST actions through", async () => {
  let receivedRequest: Request | undefined;
  const originalRequest = request("/api/auth/callback/stalwart");
  const response = await handleGuardedAuthPost(originalRequest, {
    isTrustedOrigin: () => false,
    getSessionId: async () => {
      throw new Error("must not read the session for a callback");
    },
    revokeSession: async () => {
      throw new Error("must not revoke a session for a callback");
    },
    authPost: async (authRequest) => {
      receivedRequest = authRequest;
      return new Response("callback", { status: 200 });
    },
  });

  assert.equal(receivedRequest, originalRequest);
  assert.equal(await response.text(), "callback");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
