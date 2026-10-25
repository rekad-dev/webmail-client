import assert from "node:assert/strict";
import { test } from "node:test";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { createOAuthSessionCallback } from "../lib/auth/session-callback.mts";

const activeSession: Session = {
  expires: "2030-01-01T00:00:00.000Z",
  user: {
    name: "Ravel",
    email: "ravel@rekad.id",
    image: null,
  },
};

test("session callback exposes the OAuth subject from the active server session", async () => {
  let lookedUpSessionId: string | null = null;
  const callback = createOAuthSessionCallback(async (sessionId) => {
    lookedUpSessionId = sessionId;
    return {
      subject: "stable-oauth-subject",
      expiresAt: new Date("2030-02-01T00:00:00.000Z"),
    };
  });

  const result = await callback({
    session: activeSession,
    token: { sid: "app-session-id" } as JWT,
  });

  assert.equal(lookedUpSessionId, "app-session-id");
  assert.equal(result.user?.id, "stable-oauth-subject");
  assert.equal(result.user?.email, "ravel@rekad.id");
  assert.equal(result.expires, "2030-02-01T00:00:00.000Z");
});

test("session callback expires sessions without an active server-side identity", async () => {
  let lookupCount = 0;
  const missingIdCallback = createOAuthSessionCallback(async () => {
    lookupCount += 1;
    return null;
  });

  const missingId = await missingIdCallback({
    session: activeSession,
    token: {} as JWT,
  });
  assert.equal(missingId.expires, new Date(0).toISOString());
  assert.equal(lookupCount, 0);

  const revoked = await missingIdCallback({
    session: activeSession,
    token: { sid: "revoked-session-id" } as JWT,
  });
  assert.equal(revoked.expires, new Date(0).toISOString());
  assert.equal(revoked.user?.id, undefined);
  assert.equal(lookupCount, 1);
});
