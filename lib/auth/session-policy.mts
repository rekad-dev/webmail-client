/** A session that is not used for this long ends. Each use pushes the end back by this much. */
export const APP_SESSION_IDLE_SECONDS = 7 * 24 * 60 * 60;

/** No session lives longer than this, however often it is used. It also bounds the cookies. */
export const APP_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Extending by less than this is skipped, so a busy session is not rewritten on every request. */
const MIN_SLIDE_STEP_MS = 60 * 60 * 1000;

/** Expiry of a brand-new session. One without a refresh token cannot outlive its access token. */
export function sessionExpiry(now: number, accessTokenExpiresAt: number, hasRefreshToken: boolean): Date {
  const idleExpiry = now + APP_SESSION_IDLE_SECONDS * 1000;
  return new Date(hasRefreshToken ? idleExpiry : Math.min(idleExpiry, accessTokenExpiresAt));
}

/**
 * The later expiry a used session should get, or null to leave it alone.
 * Sessions that cannot refresh their token never extend, and none passes the absolute limit.
 */
export function slidingExpiry({
  now,
  createdAt,
  expiresAt,
  hasRefreshToken,
}: {
  now: number;
  createdAt: Date;
  expiresAt: Date;
  hasRefreshToken: boolean;
}): Date | null {
  if (!hasRefreshToken) return null;
  const target = Math.min(
    now + APP_SESSION_IDLE_SECONDS * 1000,
    createdAt.getTime() + APP_SESSION_MAX_AGE_SECONDS * 1000,
  );
  return target - expiresAt.getTime() >= MIN_SLIDE_STEP_MS ? new Date(target) : null;
}
