# Progress

## Current status — Phases 5–8 in progress

- The reference UI is deployed to production at
  [webmail.rekad.id](https://webmail.rekad.id). Vercel deployment
  `dpl_6tcSUUPDK5stvVwAUeZ5xBDroZZT` is `READY` and aliased to the production
  domain. The production build passed. The anonymous home page returns the
  sign-in screen; sign in to see the mailbox UI. `reference.png` remains local
  and is excluded from deployment.
- The UI commits are `ceb7367`, `f5ffd31`, `6c7e166`, `05be54c`, `2b3da1c`,
  `2f5bc16`, and `4de2c25`. Independent review found no actionable findings.
  Local verification passes: 185 tests, `pnpm typecheck`, `pnpm build`, and
  `git diff --check`.
- The prompt's phases 0–4 are complete. Phases 5–8 remain in progress; not all
  prompt requests are complete. Phase 5 still has an unresolved intermediate
  Trash-membership observation, and this test account has no Archive-role
  mailbox. Phase 6 authenticated browser and live attachment checks remain
  pending. Phase 7 offline reconnect, account-isolation, and logout checks
  remain pending. Phase 8 live notification behavior remains unverified.
  EventSource and Web Push were not implemented because they are optional.
- The latest UI deployment does not change Stalwart settings and does not use
  the admin API key.

## Phase 4 compose and send complete

- The Phase 4 plan is recorded in the Traycer artifact
  `phase-4-compose-send-plan`. Local implementation adds read-only identity
  preflight, validated plain-text composition and JMAP submission, durable
  send-attempt records, Sent placement, and an accessible compose dialog.
  `pnpm test` passed 87/87 tests; `pnpm typecheck` and `pnpm build` passed.
- With approval, the additive database migration was applied and production
  deployment `dpl_5xekSb6sLYAwedgKp22aczkXeeBx` reached Ready at
  `https://webmail.rekad.id`.
- On 2026-10-24, the authenticated JMAP preflight confirmed submission
  capability, Drafts and Sent roles, and one sender identity
  (`mail-client@rekad.id`). One plain-text test email was sent to the exact
  approved recipient `carleanoravel@gmail.com`; Cc/Bcc were empty. The app
  reported acceptance by Stalwart, the matching message appeared in Sent Items,
  and the recipient's signed-in Gmail Inbox showed that same unread message.
  No other recipient was used.
- No global Stalwart OAuth or registration setting changed; the admin API key
  was not used. At this checkpoint, Phase 4 was complete before Phase 5 was
  authorized.

## Completed milestone: Phase 3 safe email reading

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
- Production deployment `dpl_CuiyH16U1BCwhx6rH9V9bLGEjpRJ` is Ready at
  `https://webmail.rekad.id`. In the first dedicated test-account session, the
  authorized unread message “Test” opened; its sender/recipient metadata and
  formatted and plain bodies displayed, and the Inbox unread count changed from
  3 to 2 without an error. The HTML iframe has an empty sandbox and CSP that
  denies scripts, images, styles, forms, frames, and network requests; the
  sanitized source had no executable elements, network attributes, or event
  handlers. Reopening the read message on the final release verified focus on
  the detail heading and restoration to its Inbox row. No message was sent or
  deleted.
- The local password-based `pnpm jmap:smoke` reports five mailboxes and zero
  Inbox messages, while the production OAuth session listed nine. These are
  separate observed contexts; the production session provided the live Phase 3
  check. The test message had no attachments, so attachment display was not
  exercised with live attachment data. No Stalwart client or global setting
  changed, and the admin API key was not used.
- A first browser pass exposed the focus-restoration bug where the trigger row
  was unmounted. Commit `edc443c` finds the remounted row by message ID; the
  final production deployment includes and passes that fix. Phase 3 was
  complete before Phase 4 began.
- Independent review findings for development-origin trust, keyboard focus,
  and an in-flight read update are resolved. Phase 3 passed the live message
  walkthrough and is complete. No Stalwart client or global setting changed;
  the admin API key was not used.

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
