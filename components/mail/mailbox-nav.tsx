"use client";

import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mailboxIcon } from "./format";
import type { Mailbox } from "./types";

const ROLE_ORDER = ["inbox", "drafts", "sent", "junk", "trash", "archive"];
const ROLE_LABELS: Record<string, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent",
  junk: "Spam",
  trash: "Trash",
  archive: "Archive",
};

function MailboxLink({
  mailbox,
  selected,
  localPreview,
  onSelect,
}: {
  mailbox: Mailbox;
  selected: boolean;
  localPreview: boolean;
  onSelect(mailboxId: string): void;
}) {
  return (
    <Button
      aria-pressed={selected}
      className={cn("mailbox-link", selected && "is-selected")}
      disabled={localPreview}
      onClick={() => onSelect(mailbox.id)}
      title={localPreview ? "Mailbox navigation is disabled in the local preview" : mailbox.name}
      variant="ghost"
    >
      <MailIcon name={mailboxIcon(mailbox.role)} />
      <span className="mailbox-name">{ROLE_LABELS[mailbox.role ?? ""] ?? mailbox.name}</span>
      {mailbox.unreadEmails > 0 ? (
        <span className="mailbox-unread">
          <span className="visually-hidden">unread: </span>
          {mailbox.unreadEmails.toLocaleString()}
        </span>
      ) : null}
    </Button>
  );
}

export function MailboxNav({
  mailboxes,
  selectedMailboxId,
  isLoading,
  localPreview,
  onSelect,
}: {
  mailboxes: Mailbox[] | undefined;
  selectedMailboxId: string | undefined;
  isLoading: boolean;
  localPreview: boolean;
  onSelect(mailboxId: string): void;
}) {
  const link = (mailbox: Mailbox) => (
    <MailboxLink
      key={mailbox.id}
      localPreview={localPreview}
      mailbox={mailbox}
      onSelect={onSelect}
      selected={mailbox.id === selectedMailboxId}
    />
  );
  const other = mailboxes?.filter((mailbox) => mailbox.role !== null && !ROLE_ORDER.includes(mailbox.role)) ?? [];
  const folders = mailboxes?.filter((mailbox) => mailbox.role === null) ?? [];

  return (
    <nav className="mailbox-nav" aria-label="Mailboxes">
      {ROLE_ORDER.map((role) => {
        const mailbox = mailboxes?.find((item) => item.role === role);
        return mailbox ? link(mailbox) : null;
      })}
      {other.map(link)}
      {!mailboxes && isLoading ? <p className="sidebar-note">Loading mailboxes…</p> : null}
      {folders.length > 0 ? (
        <>
          {folders.map(link)}
        </>
      ) : null}
    </nav>
  );
}
