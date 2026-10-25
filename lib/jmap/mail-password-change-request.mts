export const MAX_MAIL_PASSWORD_CHANGE_REQUEST_BYTES = 16 * 1024;
const MAX_PASSWORD_BYTES = 4 * 1024;
const MAX_OTP_CODE_LENGTH = 128;

export interface MailPasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  otpCode?: string;
}

export class InvalidMailPasswordChangeRequest extends Error {
  constructor() {
    super("The password change request is invalid.");
    this.name = "InvalidMailPasswordChangeRequest";
  }
}

export class OversizedMailPasswordChangeRequest extends Error {
  constructor() {
    super("The password change request is too large.");
    this.name = "OversizedMailPasswordChangeRequest";
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidMailPasswordChangeRequest();
    if (Number(length) > MAX_MAIL_PASSWORD_CHANGE_REQUEST_BYTES) {
      throw new OversizedMailPasswordChangeRequest();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidMailPasswordChangeRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MAIL_PASSWORD_CHANGE_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new OversizedMailPasswordChangeRequest();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new InvalidMailPasswordChangeRequest();
  }
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES;
}

export async function parseMailPasswordChangeRequest(
  request: Request,
): Promise<MailPasswordChangeInput> {
  const body = recordValue(await readBody(request));
  if (!body) throw new InvalidMailPasswordChangeRequest();
  const allowedKeys = new Set(["currentPassword", "newPassword", "otpCode"]);
  if (
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    !validPassword(body.currentPassword) ||
    !validPassword(body.newPassword)
  ) {
    throw new InvalidMailPasswordChangeRequest();
  }

  if (
    Object.hasOwn(body, "otpCode") &&
    (typeof body.otpCode !== "string" ||
      body.otpCode.length === 0 ||
      body.otpCode.length > MAX_OTP_CODE_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(body.otpCode))
  ) {
    throw new InvalidMailPasswordChangeRequest();
  }

  return {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    ...(typeof body.otpCode === "string" ? { otpCode: body.otpCode } : {}),
  };
}
