import assert from "node:assert/strict";
import test from "node:test";

import { isInvalidGrantOAuthError } from "../lib/auth/oauth-refresh-errors.mts";

test("recognizes only an explicit OAuth invalid_grant response", () => {
  assert.equal(isInvalidGrantOAuthError({ error: "invalid_grant" }), true);
  assert.equal(isInvalidGrantOAuthError({ error: "temporarily_unavailable" }), false);
  assert.equal(isInvalidGrantOAuthError({ error: "invalid_client" }), false);
  assert.equal(isInvalidGrantOAuthError({}), false);
  assert.equal(isInvalidGrantOAuthError(null), false);
  assert.equal(isInvalidGrantOAuthError("invalid_grant"), false);
});
