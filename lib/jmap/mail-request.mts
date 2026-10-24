import {
  MAIL_PAGE_SIZE,
  MAX_MAIL_POSITION,
} from "./client.mts";

export interface MailListingRequest {
  mailboxId?: string;
  position: number;
}

export class InvalidMailListingRequest extends Error {
  constructor() {
    super("The mailbox listing request is invalid.");
    this.name = "InvalidMailListingRequest";
  }
}

export function parseMailListingRequest(
  searchParams: URLSearchParams,
): MailListingRequest {
  const mailboxValues = searchParams.getAll("mailboxId");
  if (mailboxValues.length > 1) throw new InvalidMailListingRequest();

  let mailboxId: string | undefined;
  if (mailboxValues.length === 1) {
    mailboxId = mailboxValues[0];
    if (
      !mailboxId ||
      mailboxId.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(mailboxId)
    ) {
      throw new InvalidMailListingRequest();
    }
  }

  const positions = searchParams.getAll("position");
  if (positions.length > 1) throw new InvalidMailListingRequest();
  const positionValue = positions[0] ?? "0";
  if (!/^(0|[1-9]\d{0,6})$/.test(positionValue)) {
    throw new InvalidMailListingRequest();
  }
  const position = Number(positionValue);
  if (
    !Number.isSafeInteger(position) ||
    position > MAX_MAIL_POSITION ||
    position % MAIL_PAGE_SIZE !== 0
  ) {
    throw new InvalidMailListingRequest();
  }

  return { ...(mailboxId ? { mailboxId } : {}), position };
}
