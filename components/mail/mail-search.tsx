"use client";

import type { RefObject } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Input } from "@/components/ui/input";

export function MailSearch({
  value,
  inputRef,
  onChange,
}: {
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
}) {
  return (
    <div className="sidebar-search">
      <div className="sidebar-search-input">
        <label className="visually-hidden" htmlFor="mail-search">Search all mail</label>
        <MailIcon name="search" size={17} />
        <Input
          aria-keyshortcuts="Control+k Meta+k"
          autoComplete="off"
          className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          id="mail-search"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search all mail"
          ref={inputRef}
          type="search"
          value={value}
        />
        <kbd aria-hidden="true">Ctrl / ⌘ K</kbd>
      </div>
    </div>
  );
}
