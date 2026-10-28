"use client";

import { MailIcon } from "@/app/mail-icons";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { mailboxIcon } from "./format";
import type { Mailbox } from "./types";

/** One menu item per destination mailbox; used flat or inside a submenu. */
export function MailboxMenuItems({
  mailboxes,
  excludeIds = [],
  onSelect,
}: {
  mailboxes: Mailbox[];
  excludeIds?: string[];
  onSelect(mailboxId: string): void;
}) {
  return mailboxes
    .filter((mailbox) => !excludeIds.includes(mailbox.id))
    .map((mailbox) => (
      <DropdownMenuItem key={mailbox.id} onSelect={() => onSelect(mailbox.id)}>
        <MailIcon name={mailboxIcon(mailbox.role)} size={16} />
        {mailbox.name}
      </DropdownMenuItem>
    ));
}
