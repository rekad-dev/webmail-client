/** Maximum absolute lifetime of a newly created application session. */
export const APP_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** A session without a refresh token cannot outlive its access token. */
export function sessionExpiry(now: number, accessTokenExpiresAt: number, hasRefreshToken: boolean): Date {
  const absoluteExpiry = now + APP_SESSION_MAX_AGE_SECONDS * 1000;
  return new Date(hasRefreshToken ? absoluteExpiry : Math.min(absoluteExpiry, accessTokenExpiresAt));
}
