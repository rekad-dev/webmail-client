# Progress

## Current milestone: Phase 0 complete

- The workspace had the project brief and harness instructions, but no app
  scaffold, package manifest, environment template, Git metadata, or existing
  deployment configuration.
- Node.js `v24.14.0`, npm `11.9.0`, and pnpm `10.33.0` are available.
- `https://mail.rekad.id/.well-known/jmap` returned a same-origin `307` to
  `/jmap/session`; the session request returned `200` with JMAP Core, JMAP Mail,
  JMAP Submission, and other capabilities. The unauthenticated session had no
  account entries.
- `https://mail.rekad.id/.well-known/oauth-authorization-server` returned
  `200` and advertises Authorization Code, refresh tokens, `openid`, and PKCE
  `S256`. OAuth Authorization Code + PKCE is the recommended Phase 1 direction;
  client registration and callback requirements remain to be checked.
- Added the minimal Next.js 16.4.2 / React 19.3.1 shell, strict TypeScript
  configuration, safe `.env.example`, and local JMAP discovery/`Mailbox/get`
  commands. Authenticated mailbox access is verified with the dedicated test
  account configured in `.env.local`.
- Verification passed: 7 focused Node tests, `pnpm typecheck`, `pnpm build`,
  `pnpm jmap:discover`, and authenticated `pnpm jmap:smoke`. The real smoke
  check returned 5 mailboxes with roles `drafts`, `inbox`, `junk`, `sent`, and
  `trash`.
- No external service or mail-server configuration was changed, and no message
  was sent or mutated.

## Remaining follow-up before Phase 1

The application's private-network route to Stalwart has not been verified, and
OAuth client registration/callback requirements remain to be checked before
Phase 1 implementation.
