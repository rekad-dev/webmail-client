export interface NewInboxMessageSummary {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
}

export interface InboxChangesBody {
  cacheScope: string;
  emailState: string;
  newInboxEmailIds: string[];
  newInboxMessages: NewInboxMessageSummary[];
  hasMore: boolean;
  hasInboxChanges: boolean;
  reset: boolean;
}

export interface FormattedMailNotification {
  title: string;
  body: string;
  tag: string;
  target: { emailId: string; threadId: string } | null;
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isSummaryObject(value: unknown): value is NewInboxMessageSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    isBoundedId(item.id) &&
    isBoundedId(item.threadId) &&
    typeof item.senderName === "string" &&
    item.senderName.length <= 128 &&
    typeof item.senderEmail === "string" &&
    item.senderEmail.length <= 256 &&
    typeof item.subject === "string" &&
    item.subject.length <= 256
  );
}

export function parseInboxChangesBody(
  value: unknown,
  expectedScope: string,
): InboxChangesBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    body.cacheScope !== expectedScope ||
    typeof body.emailState !== "string" ||
    !Array.isArray(body.newInboxEmailIds) ||
    body.newInboxEmailIds.length > 100 ||
    !body.newInboxEmailIds.every(isBoundedId) ||
    typeof body.hasMore !== "boolean" ||
    typeof body.hasInboxChanges !== "boolean" ||
    typeof body.reset !== "boolean"
  ) {
    return null;
  }

  let newInboxMessages: NewInboxMessageSummary[] = [];
  if (body.newInboxMessages !== undefined) {
    if (
      !Array.isArray(body.newInboxMessages) ||
      body.newInboxMessages.length > 20 ||
      !body.newInboxMessages.every(isSummaryObject)
    ) {
      return null;
    }
    newInboxMessages = body.newInboxMessages;
  }

  return {
    cacheScope: body.cacheScope,
    emailState: body.emailState,
    newInboxEmailIds: body.newInboxEmailIds,
    newInboxMessages,
    hasMore: body.hasMore,
    hasInboxChanges: body.hasInboxChanges,
    reset: body.reset,
  };
}

function senderDisplayName(message: NewInboxMessageSummary): string {
  const name = message.senderName.trim();
  if (name) return name;
  const email = message.senderEmail.trim();
  if (email) return email;
  return "New message";
}

function subjectDisplayText(message: NewInboxMessageSummary): string {
  const subject = message.subject.trim();
  return subject || "(no subject)";
}

export function formatMailNotificationContent(
  notifyEmailIds: string[],
  messages: NewInboxMessageSummary[],
  timestamp = Date.now(),
): FormattedMailNotification | null {
  const uniqueIds = [...new Set(notifyEmailIds)];
  const count = uniqueIds.length;
  if (count === 0) return null;

  const byId = new Map(messages.map((message) => [message.id, message]));
  const matched = uniqueIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

  if (count === 1 && matched[0]) {
    const primary = matched[0];
    return {
      title: senderDisplayName(primary),
      body: subjectDisplayText(primary),
      tag: `rekad-new-mail-${primary.id}`,
      target: { emailId: primary.id, threadId: primary.threadId },
    };
  }

  if (count > 1 && matched.length > 0) {
    const latest = matched[matched.length - 1]!;
    const remaining = count - 1;
    return {
      title: `${count} new messages`,
      body: `${senderDisplayName(latest)}: ${subjectDisplayText(latest)} (+${remaining} more)`,
      tag: `rekad-new-mail-batch-${timestamp}`,
      target: null,
    };
  }

  return {
    title: "New mail",
    body: count === 1 ? "A new message arrived." : `${count} new messages arrived.`,
    tag: `rekad-new-mail-batch-${timestamp}`,
    target: null,
  };
}
