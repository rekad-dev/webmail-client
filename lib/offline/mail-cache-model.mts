export const MAX_OFFLINE_MESSAGES = 20;
export const MAX_OFFLINE_CACHE_BYTES = 5 * 1024 * 1024;
export const MAX_OFFLINE_MESSAGE_BYTES = 512 * 1024;

export interface OfflineMessageContent {
  emailId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  textBody: string;
}

export interface OfflineMessageRecord extends OfflineMessageContent {
  cacheKey: string;
  cacheScope: string;
  savedAt: number;
  lastAccessAt: number;
  sizeBytes: number;
}

export interface OfflineAccountRecord {
  cacheScope: string;
  emailState: string;
  syncedAt: number;
}

export interface OfflineNotificationState {
  cacheScope: string;
  emailState: string;
  enabled: boolean;
  notifiedEmailIds: string[];
  updatedAt: number;
}

export function planOfflineNotificationCommit(
  cacheScope: string,
  current: OfflineNotificationState | null,
  expectedEmailState: string | null,
  nextEmailState: string,
  newEmailIds: string[],
  timestamp = Date.now(),
): {
  committed: boolean;
  notifyEmailIds: string[];
  state: OfflineNotificationState | null;
} {
  if ((current?.emailState ?? null) !== expectedEmailState) {
    return { committed: false, notifyEmailIds: [], state: null };
  }
  const notifyEmailIds = [...new Set(newEmailIds)].filter(
    (id) => !(current?.notifiedEmailIds ?? []).includes(id),
  );
  return {
    committed: true,
    notifyEmailIds,
    state: {
      cacheScope,
      emailState: nextEmailState,
      enabled: current?.enabled ?? false,
      notifiedEmailIds: [...new Set([
        ...(current?.notifiedEmailIds ?? []),
        ...newEmailIds,
      ])].slice(-100),
      updatedAt: timestamp,
    },
  };
}

export class OfflineCacheLimitError extends Error {
  constructor() {
    super("This message cannot fit in the offline mail cache.");
    this.name = "OfflineCacheLimitError";
  }
}

function cacheKey(cacheScope: string, emailId: string): string {
  return `${cacheScope}:${emailId}`;
}

function encodedRecordSize(
  value: Omit<OfflineMessageRecord, "sizeBytes">,
): number {
  let size = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = new TextEncoder().encode(JSON.stringify({ ...value, sizeBytes: size })).byteLength;
    if (next === size) return next;
    size = next;
  }
  return size;
}

export function createOfflineMessageRecord(
  cacheScope: string,
  content: OfflineMessageContent,
  timestamp = Date.now(),
): OfflineMessageRecord {
  if (
    cacheScope.length === 0 ||
    cacheScope.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(cacheScope) ||
    typeof content.emailId !== "string" ||
    content.emailId.length === 0 ||
    content.emailId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(content.emailId) ||
    typeof content.subject !== "string" ||
    content.subject.length > 512 ||
    typeof content.senderName !== "string" ||
    content.senderName.length > 256 ||
    typeof content.senderEmail !== "string" ||
    content.senderEmail.length > 320 ||
    typeof content.receivedAt !== "string" ||
    content.receivedAt.length > 64 ||
    typeof content.textBody !== "string" ||
    new TextEncoder().encode(content.textBody).byteLength > MAX_OFFLINE_CACHE_BYTES
  ) {
    throw new OfflineCacheLimitError();
  }
  const timestampValue = Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : Date.now();
  const recordWithoutSize = {
    cacheKey: cacheKey(cacheScope, content.emailId),
    cacheScope,
    ...content,
    savedAt: timestampValue,
    lastAccessAt: timestampValue,
  };
  const sizeBytes = encodedRecordSize(recordWithoutSize);
  if (sizeBytes > MAX_OFFLINE_MESSAGE_BYTES) throw new OfflineCacheLimitError();
  return {
    cacheKey: cacheKey(cacheScope, content.emailId),
    cacheScope,
    ...content,
    savedAt: timestampValue,
    lastAccessAt: timestampValue,
    sizeBytes,
  };
}

export function planOfflineCacheSave(
  existing: OfflineMessageRecord[],
  incoming: OfflineMessageRecord,
): { records: OfflineMessageRecord[]; evictedEmailIds: string[] } {
  if (incoming.sizeBytes > MAX_OFFLINE_MESSAGE_BYTES) {
    throw new OfflineCacheLimitError();
  }
  const records = existing.filter((record) =>
    record.cacheScope === incoming.cacheScope && record.cacheKey !== incoming.cacheKey,
  );
  records.push(incoming);
  const evictedEmailIds: string[] = [];
  let totalBytes = records.reduce((total, record) => total + record.sizeBytes, 0);
  while (
    records.length > MAX_OFFLINE_MESSAGES ||
    totalBytes > MAX_OFFLINE_CACHE_BYTES
  ) {
    let oldestIndex = 0;
    for (let index = 1; index < records.length; index += 1) {
      if ((records[index]?.lastAccessAt ?? 0) < (records[oldestIndex]?.lastAccessAt ?? 0)) {
        oldestIndex = index;
      }
    }
    const [removed] = records.splice(oldestIndex, 1);
    if (!removed || removed.cacheKey === incoming.cacheKey) {
      throw new OfflineCacheLimitError();
    }
    totalBytes -= removed.sizeBytes;
    evictedEmailIds.push(removed.emailId);
  }
  return { records, evictedEmailIds };
}

export function boundOfflineCacheRecords(
  records: OfflineMessageRecord[],
  cacheScope: string,
): { records: OfflineMessageRecord[]; evictedEmailIds: string[] } {
  let working = records.filter((record) => record.cacheScope === cacheScope);
  const evictedEmailIds: string[] = [];
  while (
    working.length > MAX_OFFLINE_MESSAGES ||
    working.reduce((total, record) => total + record.sizeBytes, 0) > MAX_OFFLINE_CACHE_BYTES
  ) {
    const oldest = [...working].sort((left, right) => left.lastAccessAt - right.lastAccessAt)[0];
    if (!oldest) break;
    working = working.filter((record) => record.cacheKey !== oldest.cacheKey);
    evictedEmailIds.push(oldest.emailId);
  }
  return { records: working, evictedEmailIds };
}
