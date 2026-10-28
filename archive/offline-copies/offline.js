(() => {
  "use strict";

  const DATABASE_NAME = "rekad-offline-mail";
  const DATABASE_VERSION = 2;
  const MESSAGE_STORE = "messages";
  const ACCOUNT_STORE = "accounts";
  const NOTIFICATION_STORE = "notifications";
  const ACTIVE_SCOPE_KEY = "rekad-mail-offline-scope";
  const statusElement = document.getElementById("connection-status");
  const messageElement = document.getElementById("offline-message");
  const listElement = document.getElementById("offline-list");

  function setStatus() {
    if (statusElement) {
      statusElement.textContent = navigator.onLine ? "Offline copies · online" : "Offline copies · offline";
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser does not support local offline storage."));
        return;
      }
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
      request.onerror = () => reject(request.error || new Error("Saved copies could not be opened."));
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => reject(new Error("Close another rekad Mail tab and try again."));
    });
  }

  function readSavedMessages(database, scope) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(MESSAGE_STORE, "readonly");
      const request = transaction.objectStore(MESSAGE_STORE).index("cacheScope").getAll(IDBKeyRange.only(scope));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Saved copies could not be read."));
      transaction.onabort = () => reject(transaction.error || new Error("Saved copies could not be read."));
    });
  }

  function removeMessage(scope, record) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction([MESSAGE_STORE, ACCOUNT_STORE], "readwrite");
      const messages = transaction.objectStore(MESSAGE_STORE);
      messages.delete(record.cacheKey);
      const remaining = messages.index("cacheScope").count(IDBKeyRange.only(scope));
      remaining.onsuccess = () => {
        if (remaining.result === 0) transaction.objectStore(ACCOUNT_STORE).delete(scope);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Saved copy could not be removed.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Saved copy could not be removed.")); };
    }));
  }

  function touchMessage(scope, record) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(MESSAGE_STORE, "readwrite");
      const store = transaction.objectStore(MESSAGE_STORE);
      const request = store.get(record.cacheKey);
      request.onsuccess = () => {
        const current = request.result;
        if (current && current.cacheScope === scope) {
          current.lastAccessAt = Date.now();
          store.put(current);
        }
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Saved copy could not be updated.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Saved copy could not be updated.")); };
    }));
  }

  function showMessage(text) {
    if (messageElement) messageElement.textContent = text;
  }

  function renderMessage(record, scope) {
    const item = document.createElement("li");
    item.className = "offline-item";

    const header = document.createElement("div");
    header.className = "offline-item-header";
    const title = document.createElement("h2");
    title.className = "offline-item-title";
    title.textContent = typeof record.subject === "string" && record.subject.trim()
      ? record.subject
      : "(no subject)";
    const meta = document.createElement("p");
    meta.className = "offline-item-meta";
    const sender = [record.senderName, record.senderEmail].filter((part) => typeof part === "string" && part.trim()).join(" · ");
    meta.textContent = [sender || "Unknown sender", record.receivedAt || "Date unavailable"].join(" · ");

    const actions = document.createElement("div");
    actions.className = "offline-item-actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.textContent = "Hide message";
    readButton.setAttribute("aria-expanded", "true");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove offline copy";
    actions.append(readButton, removeButton);

    const body = document.createElement("pre");
    body.className = "offline-item-body";
    body.textContent = typeof record.textBody === "string" ? record.textBody : "";
    readButton.addEventListener("click", () => {
      const hidden = body.hidden;
      body.hidden = !hidden;
      readButton.setAttribute("aria-expanded", String(hidden));
      readButton.textContent = hidden ? "Hide message" : "Read offline copy";
      if (hidden) void touchMessage(scope, record).catch(() => undefined);
    });
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        await removeMessage(scope, record);
        item.remove();
        showMessage(listElement && listElement.childElementCount === 0
          ? "No offline copies are saved on this device."
          : "Offline copy removed.");
      } catch {
        removeButton.disabled = false;
        showMessage("This offline copy could not be removed. Try again.");
      }
    });
    header.append(title, meta, actions);
    item.append(header, body);
    return item;
  }

  async function loadOfflineCopies() {
    const scope = window.localStorage.getItem(ACTIVE_SCOPE_KEY);
    if (!scope || !/^[A-Za-z0-9_-]{40,64}$/.test(scope)) {
      showMessage("Sign in while online and save a message to make an offline copy.");
      return;
    }
    const database = await openDatabase();
    try {
      const records = await readSavedMessages(database, scope);
      records.sort((left, right) => (right.lastAccessAt || 0) - (left.lastAccessAt || 0));
      if (records.length === 0) {
        showMessage("No offline copies are saved on this device.");
        return;
      }
      if (messageElement) messageElement.textContent = `${records.length} saved ${records.length === 1 ? "message" : "messages"}.`;
      for (const record of records) {
        if (record && record.cacheScope === scope && typeof record.cacheKey === "string") {
          listElement.append(renderMessage(record, scope));
        }
      }
    } finally {
      database.close();
    }
  }

  window.addEventListener("online", setStatus);
  window.addEventListener("offline", setStatus);
  setStatus();
  loadOfflineCopies().catch(() => showMessage("Saved copies could not be opened in this browser."));
})();
