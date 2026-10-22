export const AUTH_SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-rekad.session-token"
    : "authjs.session-token";

export const AUTH_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
