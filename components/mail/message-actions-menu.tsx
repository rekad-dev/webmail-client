"use client";

import { useRef } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MailboxMenuItems } from "./mailbox-menu-items";
import type { Mailbox } from "./types";

interface MessageActionsMenuProps {
  currentMailboxIds: string[];
  mailboxes: Mailbox[];
  isUnread: boolean;
  isStarred: boolean;
  actionPending: boolean;
  offlineAvailable: boolean;
  offlineSaved: boolean;
  offlineSavePending: boolean;
  originalHref: string | null;
  onReply(trigger: HTMLButtonElement): void;
  onForward(trigger: HTMLButtonElement): void;
  onToggleRead(): void;
  onToggleStar(): void;
  onArchive(): void;
  onTrash(): void;
  onMove(destinationMailboxId: string): void;
  onToggleOffline(): void;
}

export function MessageActionsMenu(props: MessageActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Reply and Forward open the composer, which takes focus itself.
  const composerOpening = useRef(false);
  const busy = props.actionPending;
  const destinations = props.mailboxes.filter((mailbox) => !props.currentMailboxIds.includes(mailbox.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Message actions" ref={triggerRef} size="icon" title="Message actions" variant="ghost">
          <MailIcon name="more" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onCloseAutoFocus={(event) => {
          if (composerOpening.current) {
            event.preventDefault();
            composerOpening.current = false;
          }
        }}
      >
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            composerOpening.current = true;
            props.onReply(triggerRef.current as HTMLButtonElement);
          }}
        >
          <MailIcon name="reply" size={16} />
          Reply
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            composerOpening.current = true;
            props.onForward(triggerRef.current as HTMLButtonElement);
          }}
        >
          <MailIcon name="forward" size={16} />
          Forward
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={props.onTrash}>
          <MailIcon name="trash" size={16} />
          Move to trash
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={props.onToggleRead}>
          <MailIcon name="mail" size={16} />
          {props.isUnread ? "Mark as read" : "Mark as unread"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={props.onToggleStar}>
          <MailIcon name="star" size={16} />
          {props.isStarred ? "Remove star" : "Add star"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={props.onArchive}>
          <MailIcon name="archive" size={16} />
          Archive
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={busy || destinations.length === 0}>
            <MailIcon name="folder" size={16} />
            Move to…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-56">
            <MailboxMenuItems
              excludeIds={props.currentMailboxIds}
              mailboxes={props.mailboxes}
              onSelect={props.onMove}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!props.offlineAvailable || props.offlineSavePending}
          onSelect={props.onToggleOffline}
        >
          <MailIcon name="offline" size={16} />
          {props.offlineSavePending ? "Saving…" : props.offlineSaved ? "Remove offline copy" : "Save offline"}
        </DropdownMenuItem>
        {props.originalHref ? (
          <DropdownMenuItem asChild>
            <a href={props.originalHref} rel="noopener noreferrer" target="_blank">
              <MailIcon name="code" size={16} />
              Show original
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
