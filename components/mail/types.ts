export interface Mailbox {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: Array<{ name: string | null; email: string }>;
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
}

export interface ThreadMessage extends EmailSummary {}

export interface ThreadView {
  threadId: string;
  messages: ThreadMessage[];
  truncated: boolean;
}

export interface MailListing {
  mailboxes: Mailbox[];
  selectedMailboxId: string;
  position: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  messages: EmailSummary[];
}

export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface EmailAttachment {
  attachmentIndex: number;
  name: string | null;
  type: string | null;
  size: number | null;
}

export interface EmailDetail {
  id: string;
  emailState: string;
  threadId: string;
  from: EmailAddress[];
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
  messageId: string[];
  inReplyTo: string[];
  references: string[];
  textBody: string | null;
  htmlBody: string | null;
  externalLinks: string[];
  bodyTruncated: boolean;
  attachments: EmailAttachment[];
  inlineImages?: Array<{ cid: string; attachmentIndex: number; type: string; size: number }>;
  mailboxIds: string[];
}

export type MailAction = "mark_read" | "mark_unread" | "star" | "unstar" | "move" | "archive" | "trash";

export interface SharedAccount {
  id: string;
  name: string;
  isReadOnly: boolean;
}
