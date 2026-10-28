import type { MailIconName } from "@/app/mail-icons";
import type { EmailAddress } from "./types";

export function senderLabel(email: { from: Array<{ name: string | null; email: string }> }): string {
  const sender = email.from[0];
  if (!sender) return "Unknown sender";
  const name = sender.name?.trim();
  const address = sender.email.trim();
  return name || address || "Unknown sender";
}

export function senderInitials(email: { from: Array<{ name: string | null; email: string }> }): string {
  const name = senderLabel(email).split("@")[0];
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase() || "?";
}

export function avatarTone(email: { from: Array<{ name: string | null; email: string }> }): number {
  return Array.from(senderLabel(email)).reduce((sum, letter) => sum + (letter.codePointAt(0) ?? 0), 0) % 6;
}

export function mailboxIcon(role: string | null): MailIconName {
  switch (role) {
    case "inbox": return "inbox";
    case "sent": return "send";
    case "drafts": return "file";
    case "archive": return "archive";
    case "trash": return "trash";
    case "junk": return "mail";
    default: return "folder";
  }
}

export function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDetailDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function addressLabel(address: EmailAddress): string {
  const name = address.name?.trim();
  const email = address.email.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email || "Unknown recipient";
}

export function formatFileSize(size: number | null): string {
  if (size === null) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
