"use client";

import { useSyncExternalStore } from "react";

const MAX_BATCH = 50;
const BATCH_DELAY_MS = 40;

// undefined: not asked yet. null: asked, no picture. number: the picture's version.
const versions = new Map<string, number | null>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function normalize(address: string | null | undefined): string | null {
  if (typeof address !== "string") return null;
  const value = address.trim().toLowerCase();
  return value.length >= 3 && value.length <= 320 && /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/.test(value)
    ? value
    : null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

async function loadBatch(batch: string[]): Promise<void> {
  try {
    const query = batch.map((address) => `address=${encodeURIComponent(address)}`).join("&");
    const response = await fetch(`/api/profile/pictures?${query}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("directory_unavailable");
    const body = (await response.json()) as { pictures?: Record<string, unknown> };
    for (const address of batch) {
      const version = body.pictures?.[address];
      versions.set(address, typeof version === "number" ? version : null);
    }
  } catch {
    // Initials stay in place; the next page load asks again.
    for (const address of batch) versions.set(address, null);
  }
  notify();
}

function flush(): void {
  timer = null;
  const pending = [...queued];
  queued.clear();
  for (let index = 0; index < pending.length; index += MAX_BATCH) {
    void loadBatch(pending.slice(index, index + MAX_BATCH));
  }
}

/** Asks about an address once per page load; many avatars share one request. */
function request(address: string): void {
  if (versions.has(address) || queued.has(address)) return;
  queued.add(address);
  timer ??= setTimeout(flush, BATCH_DELAY_MS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Forgets everything learned, for sign-out or a picture change. */
export function resetPictureDirectory(): void {
  versions.clear();
  queued.clear();
  notify();
}

/**
 * The version of the colleague's picture, null when they have none,
 * or undefined while it is still being looked up.
 */
export function usePictureVersion(address: string | null | undefined): number | null | undefined {
  const normalized = normalize(address);
  if (normalized) request(normalized);
  return useSyncExternalStore(
    subscribe,
    () => (normalized ? versions.get(normalized) : null),
    () => undefined,
  );
}

export function pictureUrl(address: string, version: number): string {
  return `/api/profile/picture?address=${encodeURIComponent(address)}&v=${version}`;
}
