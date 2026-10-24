# Progress

## Current milestone: Phase 2 inbox and mailbox listing in progress

- Phase 1 authentication completed on 2026-10-24. Production Authorization
  Code + PKCE sign-in uses the existing `webmail` client and exact callback
  `https://webmail.rekad.id/api/auth/callback/stalwart`.
- Production checks passed for login, guarded logout, invalid-credential
  rejection, isolation between two dedicated accounts, and natural-expiry
  refresh. The active session remained valid after its token expiry window;
  `/api/auth/status` returned `200` with authenticated mailbox access.
- Local verification passed: 24 tests, `pnpm typecheck`, and `pnpm build`.
  A production database outage was not simulated.
- The Phase 2 plan is recorded in the Traycer artifact
  `phase-2-inbox-listing-plan`. Scope is authenticated, read-only mailbox
  navigation and paginated summaries with preview text, manual refresh, and
  loading/empty/error states. Message detail, mutations, search, attachments,
  and deployment are excluded.
- No email content has been read or changed in Phase 2 so far. No Stalwart
  client or global registration setting changed; `requireClientRegistration`
  and `anonymousClientRegistration` remain unchanged. The admin API key is not
  used for application authentication or mailbox access.

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

Implement the authenticated read-only JMAP mailbox list and paginated message
summaries. Do not load full message bodies or mutate mailbox state. Keep Phase 3
pending and leave all global Stalwart registration settings unchanged.
