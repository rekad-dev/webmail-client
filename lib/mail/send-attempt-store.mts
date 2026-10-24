import "server-only";

import { createHash } from "node:crypto";
import postgres from "postgres";

export type MailSendAttemptState =
  | "reserved"
  | "draft_created"
  | "submitting"
  | "submitted"
  | "submitted_sent_update_pending"
  | "rejected"
  | "unknown";

export interface MailSendAttempt {
  state: MailSendAttemptState;
  emailId: string | null;
  submissionId: string | null;
  updatedAt: Date;
}

interface AttemptRow {
  state: MailSendAttemptState;
  email_id: string | null;
  submission_id: string | null;
  updated_at: Date | string;
}

type SqlClient = ReturnType<typeof postgres>;

const runtimeGlobal = globalThis as typeof globalThis & {
  __rekadMailSendSql?: SqlClient;
};

function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("A PostgreSQL DATABASE_URL is required for mail sending.");
  }

  runtimeGlobal.__rekadMailSendSql ??= postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });
  return runtimeGlobal.__rekadMailSendSql;
}

function hashSessionId(sessionId: string): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(sessionId) ||
    Buffer.from(sessionId, "base64url").length !== 32
  ) {
    throw new Error("The application session is invalid.");
  }
  return createHash("sha256").update(sessionId).digest("hex");
}

function hashAttemptKey(attemptKey: string): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(attemptKey) ||
    Buffer.from(attemptKey, "base64url").length !== 32
  ) {
    throw new Error("The mail send attempt key is invalid.");
  }
  return createHash("sha256")
    .update("rekad-mail-send-attempt\0")
    .update(attemptKey)
    .digest("hex");
}

function validateAccountId(accountId: string): void {
  if (
    typeof accountId !== "string" ||
    accountId.length === 0 ||
    accountId.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(accountId)
  ) {
    throw new Error("The JMAP account is invalid.");
  }
}

function mapAttempt(row: AttemptRow): MailSendAttempt {
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at
    : new Date(row.updated_at);
  if (!Number.isFinite(updatedAt.getTime())) {
    throw new Error("The stored mail send attempt is invalid.");
  }
  return {
    state: row.state,
    emailId: row.email_id,
    submissionId: row.submission_id,
    updatedAt,
  };
}

function attemptKeyValues({
  sessionId,
  accountId,
  attemptKey,
}: {
  sessionId: string;
  accountId: string;
  attemptKey: string;
}): { sessionHash: string; accountId: string; attemptKeyHash: string } {
  validateAccountId(accountId);
  return {
    sessionHash: hashSessionId(sessionId),
    accountId,
    attemptKeyHash: hashAttemptKey(attemptKey),
  };
}

export async function reserveMailSendAttempt(input: {
  sessionId: string;
  accountId: string;
  attemptKey: string;
}): Promise<{ created: boolean; attempt: MailSendAttempt }> {
  const keys = attemptKeyValues(input);
  const sql = getSql();

  return sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM app_mail_send_attempts
      WHERE expires_at <= now()
    `;

    const inserted = await transaction<AttemptRow[]>`
      INSERT INTO app_mail_send_attempts (
        session_hash,
        account_id,
        attempt_key_hash,
        state
      ) VALUES (
        ${keys.sessionHash},
        ${keys.accountId},
        ${keys.attemptKeyHash},
        'reserved'
      )
      ON CONFLICT (session_hash, account_id, attempt_key_hash) DO NOTHING
      RETURNING state, email_id, submission_id, updated_at
    `;
    if (inserted[0]) {
      return { created: true, attempt: mapAttempt(inserted[0]) };
    }

    const existing = await transaction<AttemptRow[]>`
      SELECT state, email_id, submission_id, updated_at
      FROM app_mail_send_attempts
      WHERE session_hash = ${keys.sessionHash}
        AND account_id = ${keys.accountId}
        AND attempt_key_hash = ${keys.attemptKeyHash}
      LIMIT 1
    `;
    if (!existing[0]) throw new Error("The mail send attempt is unavailable.");
    return { created: false, attempt: mapAttempt(existing[0]) };
  });
}

export async function getMailSendAttempt(input: {
  sessionId: string;
  accountId: string;
  attemptKey: string;
}): Promise<MailSendAttempt | null> {
  const keys = attemptKeyValues(input);
  const sql = getSql();
  const rows = await sql<AttemptRow[]>`
    SELECT state, email_id, submission_id, updated_at
    FROM app_mail_send_attempts
    WHERE session_hash = ${keys.sessionHash}
      AND account_id = ${keys.accountId}
      AND attempt_key_hash = ${keys.attemptKeyHash}
      AND expires_at > now()
    LIMIT 1
  `;
  return rows[0] ? mapAttempt(rows[0]) : null;
}

export async function transitionMailSendAttempt(input: {
  sessionId: string;
  accountId: string;
  attemptKey: string;
  from: MailSendAttemptState;
  to: MailSendAttemptState;
  emailId?: string;
  submissionId?: string;
}): Promise<MailSendAttempt | null> {
  const keys = attemptKeyValues(input);
  const sql = getSql();
  const rows = await sql<AttemptRow[]>`
    UPDATE app_mail_send_attempts
    SET state = ${input.to},
        email_id = COALESCE(${input.emailId ?? null}, email_id),
        submission_id = COALESCE(${input.submissionId ?? null}, submission_id),
        updated_at = now()
    WHERE session_hash = ${keys.sessionHash}
      AND account_id = ${keys.accountId}
      AND attempt_key_hash = ${keys.attemptKeyHash}
      AND expires_at > now()
      AND state = ${input.from}
    RETURNING state, email_id, submission_id, updated_at
  `;
  return rows[0] ? mapAttempt(rows[0]) : null;
}
