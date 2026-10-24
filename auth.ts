import NextAuth from "next-auth";

import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_COOKIE_OPTIONS,
} from "./lib/auth/cookie.mts";
import {
  createOAuthSession,
  getOAuthSessionSummary,
  revokeOAuthSession,
} from "./lib/auth/session-store.mts";
import { getStalwartClientId } from "./lib/auth/stalwart-client-id.mts";
import { runJmapOAuthAccessCheck } from "./lib/jmap/client.mts";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const STALWART_ISSUER = "https://mail.rekad.id";
const STALWART_CLIENT_ID = getStalwartClientId();
const MAIL_SCOPE = "urn:ietf:params:oauth:scope:mail";
const AUTH_METHODS = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
]);
const SAFE_CALLBACK_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "PostgresError",
  "JmapPocError",
]);

function getIssuer(): string {
  const issuer = process.env.AUTH_STALWART_ISSUER ?? STALWART_ISSUER;
  if (issuer !== STALWART_ISSUER) {
    throw new Error("AUTH_STALWART_ISSUER must match the configured Stalwart issuer.");
  }
  return issuer;
}

function getTokenAuthenticationMethod(): string {
  const method =
    process.env.AUTH_STALWART_TOKEN_AUTH_METHOD ?? "client_secret_basic";
  if (!AUTH_METHODS.has(method)) {
    throw new Error("The Stalwart OAuth token authentication method is invalid.");
  }
  return method;
}

function parseTrustedOrigins(): string[] {
  return (process.env.STALWART_JMAP_TRUSTED_ORIGINS ?? STALWART_ISSUER)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const auth = NextAuth({
  providers: [
    {
      id: "stalwart",
      name: "Stalwart",
      type: "oidc",
      issuer: getIssuer(),
      clientId: STALWART_CLIENT_ID,
      clientSecret: process.env.AUTH_STALWART_SECRET ?? "",
      client: {
        token_endpoint_auth_method: getTokenAuthenticationMethod(),
      },
      authorization: {
        params: {
          scope: `openid offline_access ${MAIL_SCOPE}`,
        },
      },
      checks: ["pkce", "state", "nonce"],
      profile(profile) {
        if (typeof profile.sub !== "string" || profile.sub.length === 0) {
          throw new Error("Stalwart did not return a valid OIDC subject.");
        }
        return {
          id: profile.sub,
          name: typeof profile.name === "string" ? profile.name : null,
          email: typeof profile.email === "string" ? profile.email : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        };
      },
    },
  ],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      name: AUTH_SESSION_COOKIE_NAME,
      options: AUTH_SESSION_COOKIE_OPTIONS,
    },
  },
  callbacks: {
    async jwt({ token, account }) {
      if (!account) return token;

      let stage = "validate_oauth_response";
      try {
        if (
          account.provider !== "stalwart" ||
          typeof account.providerAccountId !== "string" ||
          account.providerAccountId.length === 0 ||
          typeof account.access_token !== "string" ||
          typeof account.expires_at !== "number"
        ) {
          throw new Error("The Stalwart OAuth response is incomplete.");
        }

        const accessTokenExpiresAt = account.expires_at * 1000;
        // Auth.js gives user.id an app ID; providerAccountId is the OIDC subject.
        stage = "jmap_access_check";
        const jmapOptions = {
          accessToken: account.access_token,
          sessionUrl:
            process.env.STALWART_JMAP_SESSION_URL ??
            `${STALWART_ISSUER}/.well-known/jmap`,
          trustedOrigins: parseTrustedOrigins(),
          allowInsecureHttp:
            process.env.STALWART_JMAP_ALLOW_INSECURE_HTTP === "true",
        };
        const { accountId } = await runJmapOAuthAccessCheck(jmapOptions);
        stage = "persist_session";
        const { sessionId } = await createOAuthSession({
          subject: account.providerAccountId,
          accountId,
          accessToken: account.access_token,
          ...(typeof account.refresh_token === "string"
            ? { refreshToken: account.refresh_token }
            : {}),
          accessTokenExpiresAt,
        });

        stage = "attach_app_session";
        token.sid = sessionId;
        return token;
      } catch (error) {
        const errorName =
          error instanceof Error && SAFE_CALLBACK_ERROR_NAMES.has(error.name)
            ? error.name
            : "UnknownError";
        const sqlState =
          typeof error === "object" &&
          error !== null &&
          errorName === "PostgresError" &&
          "code" in error &&
          typeof error.code === "string" &&
          /^[A-Z0-9]{5}$/.test(error.code)
            ? error.code
            : undefined;
        const safeReason =
          error instanceof Error &&
          error.message === "The Stalwart OAuth response is incomplete."
            ? error.message
            : undefined;
        console.error("[auth][stalwart] sign-in finalization failed", {
          stage,
          errorName,
          ...(sqlState ? { sqlState } : {}),
          ...(safeReason ? { safeReason } : {}),
        });
        throw new Error("The Stalwart sign-in could not be completed.");
      }
    },
    async session({ session, token }) {
      if (typeof token.sid !== "string") {
        return { ...session, expires: new Date(0).toISOString() };
      }

      try {
        const activeSession = await getOAuthSessionSummary(token.sid);
        if (!activeSession) {
          return { ...session, expires: new Date(0).toISOString() };
        }
        return { ...session, expires: activeSession.expiresAt.toISOString() };
      } catch {
        return { ...session, expires: new Date(0).toISOString() };
      }
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string") {
        try {
          await revokeOAuthSession(message.token.sid);
        } catch {
          // The route revokes before delegating; this is an idempotent fallback.
        }
      }
    },
  },
});

export const { handlers, auth: getAuthSession, signIn } = auth;
