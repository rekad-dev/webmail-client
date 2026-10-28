"use client";

import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoveToMenu } from "./move-to-menu";
import type { MailAction, Mailbox } from "./types";

const SECONDARY_ACTIONS = [
  ["mark_read", "Mark read"],
  ["mark_unread", "Mark unread"],
  ["star", "Star"],
  ["unstar", "Unstar"],
] as const;

interface BulkToolbarProps {
  mailboxes: Mailbox[];
  selectedCount: number;
  selectableCount: number;
  localPreview: boolean;
  isLoading: boolean;
  actionPending: boolean;
  archiveAvailable: boolean;
  trashAvailable: boolean;
  statusText: string;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious(): void;
  onNext(): void;
  onSelectAll(checked: boolean): void;
  onAction(action: MailAction): void;
  onMove(mailboxId: string): void;
}

export function BulkToolbar({
  mailboxes,
  selectedCount,
  selectableCount,
  localPreview,
  isLoading,
  actionPending,
  archiveAvailable,
  trashAvailable,
  statusText,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onSelectAll,
  onAction,
  onMove,
}: BulkToolbarProps) {
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;
  const noSelection = selectedCount === 0 || actionPending;

  return (
    <div className="message-toolbar" aria-label="Message list controls">
      <div className="bulk-toolbar">
        <div className="page-select" title="Select conversations on this page">
          <Checkbox
            aria-label="Select all conversations on this page"
            checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
            disabled={localPreview || isLoading || actionPending || selectableCount === 0}
            onCheckedChange={(checked) => onSelectAll(checked === true)}
          />
          <span className="visually-hidden">{selectedCount} selected</span>
        </div>
        <nav className="list-pagination" aria-label="Message pages">
          <span className="list-pagination-count">{statusText}</span>
          <Button aria-label="Previous page" className="list-page-button" disabled={!canPrevious} onClick={onPrevious} size="icon" variant="ghost"><MailIcon name="chevron-left" size={17} /></Button>
          <Button aria-label="Next page" className="list-page-button" disabled={!canNext} onClick={onNext} size="icon" variant="ghost"><MailIcon name="chevron-right" size={17} /></Button>
        </nav>
        <div className="bulk-action-group" role="group" aria-label="Selected conversation actions">
          <MoveToMenu
            ariaLabel="Move selected conversations to mailbox"
            disabled={localPreview || noSelection}
            label="Move to"
            mailboxes={mailboxes}
            onMove={onMove}
          />
          <Button
            aria-label="Move selected conversations to Trash"
            disabled={localPreview || noSelection || !trashAvailable}
            onClick={() => onAction("trash")}
            size="sm"
            title="Move selected conversations to Trash"
            variant="ghost"
          >
            <MailIcon name="trash" size={18} />
            <span>Delete</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bulk-more" aria-label="More selected conversation actions" size="icon-sm" variant="ghost">
                <MailIcon name="more" size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                disabled={localPreview || noSelection || !archiveAvailable}
                onSelect={() => onAction("archive")}
              >
                Archive
              </DropdownMenuItem>
              {SECONDARY_ACTIONS.map(([action, label]) => (
                <DropdownMenuItem disabled={noSelection} key={action} onSelect={() => onAction(action)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
