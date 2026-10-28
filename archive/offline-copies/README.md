# Offline copies (archived 2026-10-28)

The "save a message on this device" feature is switched off. Nothing here is
loaded by the app.

- `offline.html`, `offline.css`, `offline.js`, `sw.js`: the static offline page
  and its service worker, moved out of `public/`. `public/sw.js` is now a
  retirement worker that clears the old cache and unregisters itself.
- Still in the repository, unused: `lib/offline/mail-cache*.mts` (IndexedDB
  model; the new-mail alert preference also lives there), `/api/mail/offline-sync`,
  and the save/sync code in `app/inbox-client.tsx` behind
  `OFFLINE_COPIES_ENABLED` in `lib/offline/feature.mts`.

To bring it back, set the flag to `true`, move the three offline files and the
original `sw.js` back into `public/`, and re-add the sign-in page link.
