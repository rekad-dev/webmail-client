import assert from "node:assert/strict";
import test from "node:test";
import { authorizedMailAccounts, InvalidJmapAccountScope, JMAP_MAIL_CAPABILITY as MAIL, requireAuthorizedMailAccount } from "../lib/jmap/account-scope.mts";

const account = (isPersonal: boolean, isReadOnly: boolean, mail = true, name?: string) => ({
  ...(name ? { name } : {}), isPersonal, isReadOnly, accountCapabilities: mail ? { [MAIL]: {} } : {},
});
const session = () => ({
  primaryAccounts: { [MAIL]: "primary" },
  accounts: {
    primary: account(true, false),
    group: account(false, false, true, "core@rekad.id"),
    read_only: account(false, true),
    personal_other: account(true, false),
    calendar_only: account(false, false, false),
  },
});

test("discovers only the primary and advertised non-personal mail accounts", () => {
  assert.deepEqual(authorizedMailAccounts(session(), "primary"), [
    { id: "primary", name: "primary", isPrimary: true, isReadOnly: false },
    { id: "group", name: "core@rekad.id", isPrimary: false, isReadOnly: false },
    { id: "read_only", name: "read_only", isPrimary: false, isReadOnly: true },
  ]);
});

test("rejects a changed primary account and unknown or revoked accounts", () => {
  assert.throws(() => authorizedMailAccounts(session(), "other"), InvalidJmapAccountScope);
  assert.throws(() => requireAuthorizedMailAccount(session(), "primary", "unadvertised"), InvalidJmapAccountScope);
  const revoked = session();
  delete (revoked.accounts as Record<string, unknown>).group;
  assert.throws(() => requireAuthorizedMailAccount(revoked, "primary", "group"), InvalidJmapAccountScope);
});

test("does not accept malformed shared account metadata", () => {
  const malformed = session();
  (malformed.accounts as Record<string, unknown>).bad = { isPersonal: false, accountCapabilities: { [MAIL]: {} } };
  assert.throws(() => requireAuthorizedMailAccount(malformed, "primary", "bad"), InvalidJmapAccountScope);
});

test("rejects missing primary capabilities and unbounded account sets", () => {
  const missing = session();
  missing.accounts.primary.accountCapabilities = {};
  assert.throws(() => authorizedMailAccounts(missing, "primary"), InvalidJmapAccountScope);
  const many = session();
  for (let index = 0; index < 128; index++) (many.accounts as Record<string, unknown>)[`extra${index}`] = account(false, false);
  assert.throws(() => authorizedMailAccounts(many, "primary"), InvalidJmapAccountScope);
});
