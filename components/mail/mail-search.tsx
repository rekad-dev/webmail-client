"use client";

import { useEffect, useState, type RefObject } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Input } from "@/components/ui/input";
import { formatDate, senderLabel } from "./format";
import type { EmailSummary } from "./types";

export type SearchFilters = { hasAttachment: boolean; recent: boolean; fromMe: boolean };

export function MailSearch({ value, inputRef, onChange, filters, onFiltersChange, messages, loading, error, onOpen, canOpen, accountKey, canFilter, canFromMe }: {
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
  filters: SearchFilters;
  onFiltersChange(filters: SearchFilters): void;
  messages: EmailSummary[];
  loading: boolean;
  error: boolean;
  onOpen(message: EmailSummary): void;
  canOpen(message: EmailSummary): boolean;
  accountKey: string;
  canFilter: boolean;
  canFromMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const storageKey = `rekad.search-history:${accountKey}`;

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      setRecent(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string" && item.length <= 256).slice(0, 8) : []);
    } catch { setRecent([]); }
  }, [storageKey]);

  function submit(query: string) {
    const normalized = query.trim().slice(0, 256);
    onChange(normalized);
    if (normalized) {
      const next = [normalized, ...recent.filter((item) => item !== normalized)].slice(0, 8);
      setRecent(next);
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Search still works if storage is unavailable. */ }
    }
    setOpen(false);
  }

  return (
    <div className="sidebar-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}>
      <form className="sidebar-search-input" role="search" onSubmit={(event) => { event.preventDefault(); submit(value); }}>
        <label className="visually-hidden" htmlFor="mail-search">Search all mail</label>
        <MailIcon name="search" size={20} />
        <Input aria-keyshortcuts="Control+k Meta+k" aria-expanded={open} aria-controls="mail-search-panel" autoComplete="off" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" id="mail-search" maxLength={256} onFocus={() => setOpen(true)} onChange={(event) => onChange(event.target.value)} placeholder="Search all mail" ref={inputRef} type="search" value={value} />
        {value ? <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { onChange(""); inputRef.current?.focus(); }}><MailIcon name="close" size={18} /></button> : null}
      </form>
      {open ? <div className="search-panel" id="mail-search-panel">
        <div className="search-filters" aria-label="Search filters">
          {([ ["hasAttachment", "Has attachment"], ["recent", "Last 7 days"], ["fromMe", "From me"] ] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filters[key]} disabled={!canFilter || (key === "fromMe" && !canFromMe)} onClick={() => onFiltersChange({ ...filters, [key]: !filters[key] })}>{label}</button>
          ))}
        </div>
        {value.trim() ? (
          <div className="search-suggestions" aria-live="polite">
            {loading ? <p>Searching…</p> : error ? <p>Search is unavailable. Try again.</p> : messages.length ? messages.slice(0, 5).map((message) => (
              <button key={message.id} type="button" className="search-suggestion" disabled={!canOpen(message)} onClick={() => { submit(value); onOpen(message); }}>
                <MailIcon name="mail" size={18} /><span><strong>{message.subject?.trim() || "(no subject)"}</strong><small>{senderLabel(message)}</small></span><time dateTime={message.receivedAt ?? undefined}>{formatDate(message.receivedAt)}</time>
              </button>
            )) : <p>No matching conversations.</p>}
            <button type="button" className="search-all" onClick={() => submit(value)}><MailIcon name="search" size={18} /><span>See all results for “{value.trim()}”</span><small>Enter</small></button>
          </div>
        ) : recent.length ? <div className="search-history">{recent.map((query) => <button key={query} type="button" onClick={() => submit(query)}><MailIcon name="search" size={17} /><span>{query}</span></button>)}</div> : <p className="search-empty">Recent searches will appear here.</p>}
      </div> : null}
    </div>
  );
}
