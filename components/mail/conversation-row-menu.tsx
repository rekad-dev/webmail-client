"use client";

import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MailboxMenuItems } from "./mailbox-menu-items";
import type { MailAction, Mailbox } from "./types";

/** Per-conversation actions menu shown at the end of a list row. */
export function ConversationRowMenu({
  label,
  isUnread,
  isStarred,
  mailboxes,
  actionPending,
  archiveAvailable,
  trashAvailable,
  onAction,
  onMove,
}: {
  label: string;
  isUnread: boolean;
  isStarred: boolean;
  mailboxes: Mailbox[];
  actionPending: boolean;
  archiveAvailable: boolean;
  trashAvailable: boolean;
  onAction(action: MailAction): void;
  onMove(mailboxId: string): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`Actions for conversation from ${label}`} size="icon" variant="ghost">
          <MailIcon name="more" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={actionPending} onSelect={() => onAction(isUnread ? "mark_read" : "mark_unread")}>
          {isUnread ? "Mark read" : "Mark unread"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={actionPending} onSelect={() => onAction(isStarred ? "unstar" : "star")}>
          {isStarred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={actionPending}>Move to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-56">
            <MailboxMenuItems mailboxes={mailboxes} onSelect={onMove} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={actionPending || !archiveAvailable} onSelect={() => onAction("archive")}>
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem disabled={actionPending || !trashAvailable} onSelect={() => onAction("trash")}>
          Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
