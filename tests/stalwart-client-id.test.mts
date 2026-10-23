import assert from "node:assert/strict";
import test from "node:test";

import { getStalwartClientId } from "../lib/auth/stalwart-client-id.mts";

test("uses the existing webmail OAuth client ID", () => {
  assert.equal(getStalwartClientId("webmail"), "webmail");
  assert.equal(getStalwartClientId(undefined), "webmail");
  assert.throws(
    () => getStalwartClientId("another-client"),
    /must identify the existing webmail client/,
  );
});
