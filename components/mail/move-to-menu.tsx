"use client";

import type { ReactNode } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MailboxMenuItems } from "./mailbox-menu-items";
import type { Mailbox } from "./types";

/** "Move to…" button that lists mailboxes in a menu. */
export function MoveToMenu({
  mailboxes,
  disabled,
  label = "Move to…",
  ariaLabel,
  className,
  onMove,
  children,
}: {
  mailboxes: Mailbox[];
  disabled?: boolean;
  label?: string;
  ariaLabel: string;
  className?: string;
  onMove(mailboxId: string): void;
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={ariaLabel} className={className} disabled={disabled} size="sm" variant="ghost">
          {children ?? (
            <>
              <MailIcon name="folder" size={18} />
              <span>{label}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56">
        <MailboxMenuItems mailboxes={mailboxes} onSelect={onMove} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
