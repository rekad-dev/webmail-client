"use strict";

// Offline copies are archived. This worker only removes the shell that an
// earlier version cached and then unregisters itself. The original worker is
// kept in archive/offline-copies/sw.js.
self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("rekad-mail-offline-shell-"))
        .map((key) => caches.delete(key))))
      .then(() => self.registration.unregister()),
  );
});
