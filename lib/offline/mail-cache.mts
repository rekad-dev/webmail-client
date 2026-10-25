import {
  boundOfflineCacheRecords,
  createOfflineMessageRecord,
  MAX_OFFLINE_CACHE_BYTES,
  MAX_OFFLINE_MESSAGES,
  OfflineCacheLimitError,
  planOfflineNotificationCommit,
  planOfflineCacheSave,
  type OfflineAccountRecord,
  type OfflineMessageContent,
  type OfflineMessageRecord,
  type OfflineNotificationState,
} from "./mail-cache-model.mts";

const DATABASE_NAME = "rekad-offline-mail";
const DATABASE_VERSION = 2;
const MESSAGE_STORE = "messages";
const ACCOUNT_STORE = "accounts";
const NOTIFICATION_STORE = "notifications";
const ACTIVE_SCOPE_KEY = "rekad-mail-offline-scope";

export { MAX_OFFLINE_CACHE_BYTES, MAX_OFFLINE_MESSAGES };
export { OfflineCacheLimitError };
export type { OfflineAccountRecord, OfflineMessageContent, OfflineMessageRecord };

export interface OfflineSyncPage {
  emailState: string;
  updated: OfflineMessageContent[];
  destroyed: string[];
  reset: boolean;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Offline storage is unavailable in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
        const messages = database.createObjectStore(MESSAGE_STORE, { keyPath: "cacheKey" });
        messages.createIndex("cacheScope", "cacheScope", { unique: false });
      }
      if (!database.objectStoreNames.contains(ACCOUNT_STORE)) {
        database.createObjectStore(ACCOUNT_STORE, { keyPath: "cacheScope" });
      }
      if (!database.objectStoreNames.contains(NOTIFICATION_STORE)) {
        database.createObjectStore(NOTIFICATION_STORE, { keyPath: "cacheScope" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not open."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readScopeRecords(
  store: IDBObjectStore,
  cacheScope: string,
): IDBRequest<OfflineMessageRecord[]> {
  return store.index("cacheScope").getAll(IDBKeyRange.only(cacheScope));
}

export async function getOfflineCache(cacheScope: string): Promise<{
  account: OfflineAccountRecord | null;
  messages: OfflineMessageRecord[];
}> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE], "readonly");
    const recordsRequest = readScopeRecords(transaction.objectStore(MESSAGE_STORE), cacheScope);
    const accountRequest = transaction.objectStore(ACCOUNT_STORE).get(cacheScope);
    const [messages, account] = await Promise.all([
      new Promise<OfflineMessageRecord[]>((resolve, reject) => {
        recordsRequest.onsuccess = () => resolve(recordsRequest.result);
        recordsRequest.onerror = () => reject(recordsRequest.error);
      }),
      new Promise<OfflineAccountRecord | null>((resolve, reject) => {
        accountRequest.onsuccess = () => resolve(accountRequest.result ?? null);
        accountRequest.onerror = () => reject(accountRequest.error);
      }),
    ]);
    return {
      account,
      messages: messages.sort((left, right) => right.lastAccessAt - left.lastAccessAt),
    };
  } finally {
    database.close();
  }
}

export async function getOfflineNotificationState(
  cacheScope: string,
): Promise<OfflineNotificationState | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTIFICATION_STORE, "readonly");
    const request = transaction.objectStore(NOTIFICATION_STORE).get(cacheScope);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Notification settings could not be read."));
    });
  } finally {
    database.close();
  }
}

export async function commitOfflineNotificationChanges(
  cacheScope: string,
  expectedEmailState: string | null,
  nextEmailState: string,
  newEmailIds: string[],
): Promise<{ committed: boolean; notifyEmailIds: string[]; enabled: boolean }> {
  if (
    !cacheScope ||
    typeof nextEmailState !== "string" ||
    nextEmailState.length === 0 ||
    nextEmailState.length > 256 ||
    newEmailIds.length > 100 ||
    newEmailIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 256)
  ) {
    throw new Error("Notification state is invalid.");
  }
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(NOTIFICATION_STORE, "readwrite");
    const store = transaction.objectStore(NOTIFICATION_STORE);
    const request = store.get(cacheScope);
    let result: { committed: boolean; notifyEmailIds: string[]; enabled: boolean } = {
      committed: false,
      notifyEmailIds: [],
      enabled: false,
    };
    request.onsuccess = () => {
      const current = request.result as OfflineNotificationState | undefined;
      const plan = planOfflineNotificationCommit(
        cacheScope,
        current ?? null,
        expectedEmailState,
        nextEmailState,
        newEmailIds,
      );
      if (!plan.committed || !plan.state) return;
      store.put(plan.state);
      result = {
        committed: true,
        notifyEmailIds: plan.notifyEmailIds,
        enabled: plan.state.enabled,
      };
    };
    request.onerror = () => {
      transaction.abort();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Notification state could not be saved."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Notification state could not be saved."));
    };
  });
}

export async function setOfflineNotificationsEnabled(
  cacheScope: string,
  enabled: boolean,
): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(NOTIFICATION_STORE, "readwrite");
    const store = transaction.objectStore(NOTIFICATION_STORE);
    const request = store.get(cacheScope);
    request.onsuccess = () => {
      const current = request.result as OfflineNotificationState | undefined;
      if (!current || !current.emailState) {
        transaction.abort();
        return;
      }
      store.put({ ...current, enabled, updatedAt: Date.now() });
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Notification preference could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Notification preference could not be saved."));
  }).finally(() => database.close());
}

export async function saveOfflineMessage(
  cacheScope: string,
  content: OfflineMessageContent,
  emailState: string,
): Promise<{ evictedEmailIds: string[] }> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE], "readwrite");
    const messageStore = transaction.objectStore(MESSAGE_STORE);
    const accountStore = transaction.objectStore(ACCOUNT_STORE);
    const messagesRequest = readScopeRecords(messageStore, cacheScope);
    const accountRequest = accountStore.get(cacheScope);
    let messagesReady = false;
    let accountReady = false;
    let messages: OfflineMessageRecord[] = [];
    let account: OfflineAccountRecord | null = null;
    let evictedEmailIds: string[] = [];
    let failure: unknown = null;
    const writeIfReady = () => {
      if (!messagesReady || !accountReady || failure) return;
      try {
        const timestamp = Date.now();
        const incoming = createOfflineMessageRecord(cacheScope, content, timestamp);
        const plan = planOfflineCacheSave(messages, incoming);
        evictedEmailIds = plan.evictedEmailIds;
        for (const record of messages) messageStore.delete(record.cacheKey);
        for (const record of plan.records) messageStore.put(record);
        accountStore.put(account ?? {
          cacheScope,
          emailState,
          syncedAt: timestamp,
        });
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    messagesRequest.onsuccess = () => {
      messages = messagesRequest.result;
      messagesReady = true;
      writeIfReady();
    };
    accountRequest.onsuccess = () => {
      account = accountRequest.result ?? null;
      accountReady = true;
      writeIfReady();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve({ evictedEmailIds });
    };
    transaction.onerror = () => {
      failure ??= transaction.error ?? new Error("Offline message could not be saved.");
    };
    transaction.onabort = () => {
      database.close();
      reject(failure ?? transaction.error ?? new Error("Offline message could not be saved."));
    };
  });
}

export async function applyOfflineSyncPage(
  cacheScope: string,
  page: OfflineSyncPage,
): Promise<{ evictedEmailIds: string[] }> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE], "readwrite");
    const messageStore = transaction.objectStore(MESSAGE_STORE);
    const accountStore = transaction.objectStore(ACCOUNT_STORE);
    const messagesRequest = readScopeRecords(messageStore, cacheScope);
    const accountRequest = accountStore.get(cacheScope);
    let messagesReady = false;
    let accountReady = false;
    let messages: OfflineMessageRecord[] = [];
    let account: OfflineAccountRecord | null = null;
    let evictedEmailIds: string[] = [];
    let failure: unknown = null;
    const writeIfReady = () => {
      if (!messagesReady || !accountReady || failure) return;
      try {
        const timestamp = Date.now();
        const destroyed = new Set(page.destroyed);
        const next = page.reset
          ? []
          : messages.filter((record) => !destroyed.has(record.emailId));
        for (const content of page.updated) {
          const prior = messages.find((record) => record.emailId === content.emailId);
          const replacement = createOfflineMessageRecord(
            cacheScope,
            content,
            prior?.savedAt ?? timestamp,
          );
          replacement.lastAccessAt = prior?.lastAccessAt ?? timestamp;
          const existingIndex = next.findIndex((record) => record.emailId === content.emailId);
          if (existingIndex >= 0) next.splice(existingIndex, 1);
          next.push(replacement);
        }
        const bounded = boundOfflineCacheRecords(next, cacheScope);
        evictedEmailIds = bounded.evictedEmailIds;
        for (const record of messages) messageStore.delete(record.cacheKey);
        for (const record of bounded.records) messageStore.put(record);
        accountStore.put({
          cacheScope,
          emailState: page.emailState,
          syncedAt: timestamp,
        });
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    messagesRequest.onsuccess = () => {
      messages = messagesRequest.result;
      messagesReady = true;
      writeIfReady();
    };
    accountRequest.onsuccess = () => {
      account = accountRequest.result ?? null;
      accountReady = true;
      writeIfReady();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve({ evictedEmailIds });
    };
    transaction.onerror = () => {
      failure ??= transaction.error ?? new Error("Offline mail sync could not be applied.");
    };
    transaction.onabort = () => {
      database.close();
      reject(failure ?? transaction.error ?? new Error("Offline mail sync could not be applied."));
    };
  });
}

export async function removeOfflineMessage(
  cacheScope: string,
  emailId: string,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE], "readwrite");
    const messageStore = transaction.objectStore(MESSAGE_STORE);
    messageStore.delete(`${cacheScope}:${emailId}`);
    const remainingRequest = messageStore.index("cacheScope").count(IDBKeyRange.only(cacheScope));
    remainingRequest.onsuccess = () => {
      if (remainingRequest.result === 0) {
        transaction.objectStore(ACCOUNT_STORE).delete(cacheScope);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline message could not be removed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline message could not be removed."));
  });
}

export async function touchOfflineMessage(
  cacheScope: string,
  emailId: string,
): Promise<OfflineMessageRecord | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    const store = transaction.objectStore(MESSAGE_STORE);
    const request = store.get(`${cacheScope}:${emailId}`);
    let record: OfflineMessageRecord | null = null;
    request.onsuccess = () => {
      const stored = request.result as OfflineMessageRecord | undefined;
      if (stored) {
        stored.lastAccessAt = Date.now();
        store.put(stored);
        record = stored;
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(record);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline message could not be read."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline message could not be read."));
  });
}

export async function clearOtherOfflineAccounts(activeScope: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE, NOTIFICATION_STORE], "readwrite");
    const messageStore = transaction.objectStore(MESSAGE_STORE);
    const accountStore = transaction.objectStore(ACCOUNT_STORE);
    const notificationStore = transaction.objectStore(NOTIFICATION_STORE);
    const messagesRequest = messageStore.getAll();
    const accountsRequest = accountStore.getAll();
    const notificationsRequest = notificationStore.getAll();
    messagesRequest.onsuccess = () => {
      for (const record of messagesRequest.result as OfflineMessageRecord[]) {
        if (record.cacheScope !== activeScope) messageStore.delete(record.cacheKey);
      }
    };
    accountsRequest.onsuccess = () => {
      for (const account of accountsRequest.result as OfflineAccountRecord[]) {
        if (account.cacheScope !== activeScope) accountStore.delete(account.cacheScope);
      }
    };
    notificationsRequest.onsuccess = () => {
      for (const state of notificationsRequest.result as OfflineNotificationState[]) {
        if (state.cacheScope !== activeScope) notificationStore.delete(state.cacheScope);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline account cache could not be isolated."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline account cache could not be isolated."));
  });
}

export async function clearAllOfflineMail(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE, NOTIFICATION_STORE], "readwrite");
    transaction.objectStore(MESSAGE_STORE).clear();
    transaction.objectStore(ACCOUNT_STORE).clear();
    transaction.objectStore(NOTIFICATION_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline cache could not be cleared."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline cache could not be cleared."));
  }).finally(() => database.close());
  window.localStorage.removeItem(ACTIVE_SCOPE_KEY);
}

export function setActiveOfflineScope(cacheScope: string): void {
  window.localStorage.setItem(ACTIVE_SCOPE_KEY, cacheScope);
}

export function getActiveOfflineScope(): string | null {
  return window.localStorage.getItem(ACTIVE_SCOPE_KEY);
}
