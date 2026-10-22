import assert from "node:assert/strict";
import test from "node:test";

import { encodeOAuthClientBasicCredentials } from "../lib/auth/oauth-client-auth.mts";

test("form-encodes both OAuth client credentials before Basic auth encoding", () => {
  const encoded = encodeOAuthClientBasicCredentials(
    "client: id",
    "secret: value+with%",
  );

  assert.equal(
    Buffer.from(encoded, "base64").toString("utf8"),
    "client%3A+id:secret%3A+value%2Bwith%25",
  );
});
