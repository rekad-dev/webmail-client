"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MailIcon, type MailIconName } from "./mail-icons";

export interface MessageMenuMailbox {
  id: string;
  name: string;
}

interface MessageActionsMenuProps {
  currentMailboxIds: string[];
  mailboxes: MessageMenuMailbox[];
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

type MenuView = "main" | "move";

export function MessageActionsMenu(props: MessageActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function items(): HTMLElement[] {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setView("main");
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (view === "move") setView("main");
      else close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  function choose(action: () => void) {
    close(true);
    action();
  }

  function item(label: string, icon: MailIconName, onSelect: () => void, disabled = false): ReactNode {
    return (
      <button
        aria-disabled={disabled || undefined}
        className="menu-item"
        onClick={() => {
          if (!disabled) onSelect();
        }}
        role="menuitem"
        tabIndex={-1}
        type="button"
      >
        <MailIcon name={icon} size={18} />
        <span>{label}</span>
      </button>
    );
  }

  const destinations = props.mailboxes.filter((mailbox) => !props.currentMailboxIds.includes(mailbox.id));
  const busy = props.actionPending;

  return (
    <div className="message-menu">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Message actions"
        className="icon-button"
        onClick={() => (open ? close(false) : setOpen(true))}
        ref={triggerRef}
        title="Message actions"
        type="button"
      >
        <MailIcon name="more" size={18} />
      </button>

      {open ? (
        <div
          aria-label={view === "move" ? "Move message to" : "Message actions"}
          className="menu-panel"
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {view === "main" ? (
            <>
              {item("Reply", "reply", () => choose(() => props.onReply(triggerRef.current as HTMLButtonElement)), busy)}
              {item("Forward", "forward", () => choose(() => props.onForward(triggerRef.current as HTMLButtonElement)), busy)}
              <div className="menu-separator" role="separator" />
              {item("Move to trash", "trash", () => choose(props.onTrash), busy)}
              {item(props.isUnread ? "Mark as read" : "Mark as unread", "mail", () => choose(props.onToggleRead), busy)}
              {item(props.isStarred ? "Remove star" : "Add star", "star", () => choose(props.onToggleStar), busy)}
              {item("Archive", "archive", () => choose(props.onArchive), busy)}
              {item("Move to…", "folder", () => setView("move"), busy || destinations.length === 0)}
              <div className="menu-separator" role="separator" />
              {item(
                props.offlineSavePending ? "Saving…" : props.offlineSaved ? "Remove offline copy" : "Save offline",
                "offline",
                () => choose(props.onToggleOffline),
                !props.offlineAvailable || props.offlineSavePending,
              )}
              {props.originalHref ? (
                <a
                  className="menu-item"
                  href={props.originalHref}
                  onClick={() => close(false)}
                  rel="noopener noreferrer"
                  role="menuitem"
                  tabIndex={-1}
                  target="_blank"
                >
                  <MailIcon name="code" size={18} />
                  <span>Show original</span>
                </a>
              ) : null}
            </>
          ) : (
            <>
              {item("Back", "chevron-left", () => setView("main"))}
              <div className="menu-separator" role="separator" />
              {destinations.map((mailbox) => (
                <button
                  className="menu-item"
                  key={mailbox.id}
                  onClick={() => choose(() => props.onMove(mailbox.id))}
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                >
                  <MailIcon name="folder" size={18} />
                  <span>{mailbox.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
