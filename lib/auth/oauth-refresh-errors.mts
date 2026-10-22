export class OAuthTokenRefreshError extends Error {
  readonly shouldRevokeSession: boolean;

  constructor(shouldRevokeSession: boolean) {
    super("Stalwart OAuth token refresh failed.");
    this.name = "OAuthTokenRefreshError";
    this.shouldRevokeSession = shouldRevokeSession;
  }
}

export function isInvalidGrantOAuthError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { error?: unknown }).error === "invalid_grant"
  );
}
