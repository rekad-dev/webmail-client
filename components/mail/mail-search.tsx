"use client";

import type { RefObject } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "./option-select";

export type SearchScope = "all" | "mailbox";

const SCOPE_OPTIONS = [
  { value: "all", label: "All mail" },
  { value: "mailbox", label: "Current mailbox" },
];

export function MailSearch({
  value,
  scope,
  inputRef,
  onChange,
  onScopeChange,
}: {
  value: string;
  scope: SearchScope;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
  onScopeChange(scope: SearchScope): void;
}) {
  return (
    <div className="sidebar-search">
      <div className="sidebar-search-input">
        <label className="visually-hidden" htmlFor="mail-search">Search mail</label>
        <MailIcon name="search" size={17} />
        <Input
          aria-keyshortcuts="Control+k Meta+k"
          autoComplete="off"
          className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          id="mail-search"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search..."
          ref={inputRef}
          type="search"
          value={value}
        />
        <kbd aria-hidden="true">Ctrl / ⌘ K</kbd>
      </div>
      <div className="search-scope-label">
        <label htmlFor="mail-search-scope">Search in</label>
        <OptionSelect
          className="h-9 w-auto border-0 bg-transparent px-1 shadow-none"
          id="mail-search-scope"
          onChange={(next) => onScopeChange(next as SearchScope)}
          options={SCOPE_OPTIONS}
          value={scope}
        />
      </div>
    </div>
  );
}
