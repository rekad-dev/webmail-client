import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

export interface OAuthSessionSummary {
  subject: string;
  expiresAt: Date;
}

type SessionSummaryReader = (
  sessionId: string,
) => Promise<OAuthSessionSummary | null>;

const EXPIRED_SESSION = new Date(0).toISOString();

export function createOAuthSessionCallback(
  getSessionSummary: SessionSummaryReader,
) {
  return async ({
    session,
    token,
  }: {
    session: Session;
    token: JWT;
  }): Promise<Session> => {
    const sessionId = token.sid;
    if (typeof sessionId !== "string") {
      return { ...session, expires: EXPIRED_SESSION };
    }

    try {
      const activeSession = await getSessionSummary(sessionId);
      if (
        !activeSession ||
        typeof activeSession.subject !== "string" ||
        activeSession.subject.length === 0 ||
        activeSession.subject.length > 512 ||
        !(activeSession.expiresAt instanceof Date) ||
        !Number.isFinite(activeSession.expiresAt.getTime())
      ) {
        return { ...session, expires: EXPIRED_SESSION };
      }

      return {
        ...session,
        expires: activeSession.expiresAt.toISOString(),
        user: {
          ...(session.user ?? {}),
          id: activeSession.subject,
        },
      };
    } catch {
      return { ...session, expires: EXPIRED_SESSION };
    }
  };
}
