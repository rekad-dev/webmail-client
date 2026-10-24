# Progress

## Current milestone: Phase 2 inbox listing implemented locally

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
- The authenticated UI is implemented locally but has not been deployed or
  checked in the shared browser. Keep Phase 2 in progress until the user
  approves the exact deployment and browser checklist; the Vercel project,
  domain, and Stalwart settings were not changed.

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

After explicit approval, deploy the local Phase 2 implementation to the
existing `rekad/webmail-client` project and verify it using the signed-in
dedicated account. Its inbox is currently empty, so confirm the real mailbox
navigation, empty state, and refresh; pagination requires a populated test
mailbox. Keep Phase 3 pending and leave all global Stalwart registration
settings unchanged.
