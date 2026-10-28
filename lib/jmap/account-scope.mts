/** JMAP accounts come from the authenticated session, never from a client-provided list. */
export const JMAP_MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const MAX_ADVERTISED_ACCOUNTS = 128;

export interface AuthorizedMailAccount {
  id: string;
  name: string;
  isPrimary: boolean;
  isReadOnly: boolean;
}

export class InvalidJmapAccountScope extends Error {
  constructor() {
    super("The JMAP account scope is unavailable.");
    this.name = "InvalidJmapAccountScope";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Derive candidate accounts from a fresh authenticated session. The primary
 * account must still match the OAuth session; non-personal accounts are only
 * candidates, and individual mailbox rights still need to be checked.
 */
export function authorizedMailAccounts(sessionValue: unknown, expectedPrimaryId: string): AuthorizedMailAccount[] {
  const session = record(sessionValue);
  const accounts = record(session?.accounts);
  const primaryAccounts = record(session?.primaryAccounts);
  if (!accounts || primaryAccounts?.[JMAP_MAIL_CAPABILITY] !== expectedPrimaryId ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(expectedPrimaryId)) {
    throw new InvalidJmapAccountScope();
  }
  const entries = Object.entries(accounts);
  if (entries.length > MAX_ADVERTISED_ACCOUNTS) throw new InvalidJmapAccountScope();
  const result: AuthorizedMailAccount[] = [];
  for (const [id, value] of entries) {
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(id)) continue;
    const account = record(value);
    const capabilities = record(account?.accountCapabilities);
    if (!account || !record(capabilities?.[JMAP_MAIL_CAPABILITY])) continue;
    const isPrimary = id === expectedPrimaryId;
    if (!isPrimary && account.isPersonal !== false) continue;
    if (!isPrimary && typeof account.isReadOnly !== "boolean") continue;
    const name = typeof account.name === "string" && account.name.length <= 256 &&
      !/[\u0000-\u001f\u007f]/.test(account.name) && account.name.trim() ? account.name.trim() : id;
    result.push({ id, name, isPrimary, isReadOnly: account.isReadOnly === true });
  }
  if (!result.some((account) => account.isPrimary)) throw new InvalidJmapAccountScope();
  return result;
}

/** Re-evaluate membership for each operation; a previously visible account may be revoked. */
export function requireAuthorizedMailAccount(sessionValue: unknown, expectedPrimaryId: string, accountId: string): AuthorizedMailAccount {
  const account = authorizedMailAccounts(sessionValue, expectedPrimaryId).find((item) => item.id === accountId);
  if (!account) throw new InvalidJmapAccountScope();
  return account;
}
