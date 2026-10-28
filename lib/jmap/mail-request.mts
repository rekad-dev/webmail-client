import {
  MAIL_PAGE_SIZE,
  MAX_MAIL_POSITION,
} from "./client.mts";

export interface MailListingRequest {
  mailboxId?: string;
  position: number;
  searchText?: string;
  searchScope: "all" | "mailbox";
  favorites?: boolean;
  hasAttachment?: boolean;
  recent?: boolean;
  from?: string;
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

  const searchValues = searchParams.getAll("q");
  if (searchValues.length > 1) throw new InvalidMailListingRequest();
  const searchText = searchValues[0]?.trim();
  if (
    searchText !== undefined &&
    (searchText.length > 256 || /[\u0000-\u001f\u007f]/.test(searchText))
  ) {
    throw new InvalidMailListingRequest();
  }

  const scopeValues = searchParams.getAll("searchScope");
  if (scopeValues.length > 1) throw new InvalidMailListingRequest();
  const searchScope = scopeValues[0] ?? "all";
  if (searchScope !== "all" && searchScope !== "mailbox") {
    throw new InvalidMailListingRequest();
  }

  const favoritesValues = searchParams.getAll("favorites");
  if (favoritesValues.length > 1 || (favoritesValues.length === 1 && favoritesValues[0] !== "1")) {
    throw new InvalidMailListingRequest();
  }

  const flag = (name: string) => {
    const values = searchParams.getAll(name);
    if (values.length > 1 || (values.length === 1 && values[0] !== "1")) throw new InvalidMailListingRequest();
    return values.length === 1;
  };
  const hasAttachment = flag("hasAttachment");
  const recent = flag("recent");
  const fromValues = searchParams.getAll("from");
  if (fromValues.length > 1 || (fromValues.length && (!fromValues[0] || fromValues[0].length > 256 || /[\u0000-\u001f\u007f]/.test(fromValues[0])))) throw new InvalidMailListingRequest();

  return {
    ...(favoritesValues.length ? { favorites: true } : {}),
    ...(hasAttachment ? { hasAttachment: true } : {}),
    ...(recent ? { recent: true } : {}),
    ...(fromValues.length ? { from: fromValues[0] } : {}),
    ...(mailboxId ? { mailboxId } : {}),
    position,
    ...(searchText ? { searchText } : {}),
    searchScope,
  };
}
