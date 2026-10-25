import { createHmac } from "node:crypto";

export function createOfflineCacheScope(accountId: string, secret: string): string {
  if (
    accountId.length === 0 ||
    accountId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(accountId) ||
    secret.length < 32
  ) {
    throw new Error("The offline cache scope configuration is invalid.");
  }
  return createHmac("sha256", secret)
    .update("rekad-offline-cache-scope\0")
    .update(accountId)
    .digest("base64url");
}
