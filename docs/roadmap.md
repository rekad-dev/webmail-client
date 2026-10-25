# Roadmap

The work follows the product phases in `PROMPT.md`. Phases 0 through 4 and 6
are complete. Phases 5, 7, and 8 are implemented in part and remain in progress
while the recorded verification gaps are resolved.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | Complete: production login, account isolation, natural-expiry refresh, and guarded logout verified |
| 2 | Real inbox and mailbox listing | P0 | Complete: deployed and checked with a signed-in test account |
| 3 | Safe email reading and HTML isolation | P0 | Complete: deployed and verified on a dedicated test message |
| 4 | Compose and send through JMAP | P0 | Complete: JMAP submission, Sent copy, and approved recipient Inbox verified |
| 5 | Essential mailbox actions, search, threads, and drafts | P1 | In progress: implementation and most checks are complete; Trash-membership observation remains unresolved and Archive is unavailable on the test account |
| 6 | Attachments, responsive UX, and accessibility refinement | P1 | Complete: production attachment upload/download, desktop/phone rendering, keyboard focus, and independent review passed |
| 7 | Limited offline storage and synchronization | P2, optional | In progress: bounded cache and JMAP sync implemented; offline reconnect, account-isolation, and logout checks remain pending |
| 8 | Polling, JMAP events, and optional notifications | P2, optional | In progress: polling and opt-in browser alerts implemented; live notification behavior remains unverified; EventSource and Web Push remain deferred |

Phase 4 is the first usable MVP boundary. Phase 1 reused the existing `webmail`
client and exact callback
`https://webmail.rekad.id/api/auth/callback/stalwart`, with no client or server
setting changes. Production login, bounded sessions, account isolation,
natural-expiry refresh, and guarded logout passed. Phase 2 delivered
authenticated, read-only mailbox navigation, paginated message metadata, and
manual refresh. Phase 3 added bounded message detail, sanitized and isolated
HTML, plain-text rendering, attachment metadata, and a same-origin `$seen`
update. Phase 4 added a secure plain-text compose and JMAP send flow. The
approved live test from `mail-client@rekad.id` to
`carleanoravel@gmail.com` was accepted by Stalwart, appeared in Sent Items, and
appeared as unread in the recipient's Gmail Inbox. No other recipient was used.
Phase 4 is complete. The user directed Phase 5 to start. Its plan is recorded
in the Traycer artifact `phase-5-mailbox-actions-search-threads-drafts-plan`.
No Stalwart client or server-wide setting changed.

The latest reference UI is deployed as `dpl_6tcSUUPDK5stvVwAUeZ5xBDroZZT`
and aliased to `https://webmail.rekad.id`. The anonymous home page shows the
sign-in screen; a signed-in user sees the mailbox UI. Local verification passes
with 185 tests, typecheck, and production build. The independent UI review
found no remaining actionable findings. `reference.png` remains local and is
excluded from deployment.

The missing `stalwart-webui` registration remains a future hardening
prerequisite, not an MVP blocker. Optional `requireClientRegistration`
hardening remains separate and requires the user's explicit approval after a
current settings/client review.
