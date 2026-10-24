# Progress

## Current milestone: Phase 3 safe email reading in progress

- The Phase 3 plan is recorded in the Traycer artifact
  `phase-3-safe-reading-plan`. Local implementation adds an authenticated
  message-detail JMAP read path, bounded body retrieval, server-side HTML
  sanitization, an isolated read view, attachment metadata, and a separate
  same-origin `Email/set` patch that changes only `$seen` after the body loads.
- Focused coverage passes: `pnpm test` reports 63/63, `pnpm typecheck` passes,
  and `pnpm build` passes. The test suite covers malicious HTML stripping,
  external-link handling, response size caps, account mismatch revocation,
  `$seen` patch shape, same-origin read-state authorization, and rejection of
  a different localhost port before session lookup. Focus is moved to the
  message detail and restored to the triggering inbox row; a pending read-state
  update reconciles the list or triggers a refresh.
- `pnpm jmap:smoke` succeeds against the dedicated Stalwart account and reports
  five mailboxes but zero inbox messages. No body can be opened against the
  real account yet. No message was mutated and no deployment or browser check
  was performed. A dedicated test message is required for live body and read
  state verification; changing `$seen` on it needs explicit approval.
- Independent review findings for development-origin trust, keyboard focus,
  and an in-flight read update were resolved and covered by the local route
  tests and code paths. Phase 3 remains in progress pending populated-message
  verification. No Stalwart client or global setting was changed; the admin
  API key is not used.

## Completed milestone: Phase 2 inbox and mailbox listing

- Phase 1 authentication completed on 2026-10-24. Production Authorization
  Code + PKCE sign-in uses the existing `webmail` client and exact callback
  `https://webmail.rekad.id/api/auth/callback/stalwart`.
- Production checks passed for login, guarded logout, invalid-credential
  rejection, isolation between two dedicated accounts, and natural-expiry
  refresh. The active session remained valid after its token expiry window;
  `/api/auth/status` returned `200` with authenticated mailbox access.
- The Phase 2 plan is recorded in the Traycer artifact
  `phase-2-inbox-listing-plan`. Scope is authenticated, read-only mailbox
  navigation and paginated summaries with preview text, manual refresh, and
  loading/empty/error states. Message detail, mutations, search, attachments,
  and deployment are excluded from the implementation changes.
- Local verification passed: 45 tests, `pnpm typecheck`, `pnpm build`, and a
  local unauthenticated `/api/mail` request returned `401 sign_in_required`
  with `Cache-Control: no-store` and `Vary: Cookie`.
- `pnpm jmap:smoke` succeeded against the dedicated test account: five
  mailboxes, zero inbox messages, and zero summaries fetched. It logged counts
  only. No mailbox or Stalwart settings were changed. No message bodies were
  requested or mailbox state mutated. The admin API key was not used.
- Production deployment `dpl_DbN32jRh6FHVYRmV83AWC9JP1uBj` is Ready at
  `https://webmail.rekad.id`. The signed-in test account showed five mailboxes
  and the true empty Inbox state. Selecting Drafts, returning to Inbox, and
  refreshing all worked; refresh issued a new `/api/mail` request. Pagination
  controls remained disabled for the empty inbox. No message was opened, sent,
  or changed. Live message-row and page-turn behavior could not be exercised
  without existing test messages; JMAP mapping, bounded route input, and max
  offset behavior are covered by tests.
- The Vercel project and domain remained `rekad/webmail-client` and
  `webmail.rekad.id`. No Stalwart clients or global settings changed.

## Phase 0 record

- The workspace had the project brief and harness instructions, but no app
  scaffold, package manifest, environment template, Git metadata, or existing
  deployment configuration.
- Node.js `v24.14.0`, npm `11.9.0`, and pnpm `10.33.0` are available.
- JMAP discovery succeeded at `https://mail.rekad.id/.well-known/jmap`, and
  authenticated `Mailbox/get` passed against the dedicated local test account
  with five mailbox roles: `drafts`, `inbox`, `junk`, `sent`, and `trash`.
- Existing Phase 0 verification passed: 7 focused tests, `pnpm typecheck`,
  `pnpm build`, `pnpm jmap:discover`, and `pnpm jmap:smoke`.
- No Stalwart or mail-server setting was changed, and no message was sent or
  mutated. The configured PostgreSQL database received only the app-owned,
  idempotent OAuth-session table/index migration.

## Phase 2 work

Phase 2 is complete. Production deployment `dpl_DbN32jRh6FHVYRmV83AWC9JP1uBj`
is Ready at `https://webmail.rekad.id`. The signed-in first dedicated test
account showed five mailboxes and an empty Inbox. Selecting Drafts, returning
to Inbox, and manual refresh worked; refresh generated a new `/api/mail`
request. Previous/next controls were disabled for the empty Inbox. Live
message-row display and page turns were not available to exercise without
existing messages; automated tests cover summary mapping, route pagination
input, and the max offset. No message was opened, sent, or changed. Phase 3 is
now in progress; leave all global Stalwart registration settings unchanged.
