# Progress

## Current milestone: Phase 1 authentication in progress

- Added Auth.js Stalwart OIDC Authorization Code + PKCE using the existing
  `webmail` client and registered callback
  `https://webmail.rekad.id/api/auth/callback/stalwart`.
- Auth.js verifies PKCE, state, and nonce; callback handling verifies the
  OIDC identity, then requires authenticated JMAP `Mailbox/get` before creating
  an application session.
- App sessions use a hashed opaque identifier, encrypted token payloads in
  PostgreSQL, an eight-hour maximum lifetime, refresh serialization, and local
  deletion on logout. The browser receives only the encrypted Auth.js session
  cookie, not Stalwart tokens.
- Local route checks passed: provider discovery returned `stalwart` with the
  expected callback shape; session returned `null`; unauthenticated mailbox
  status returned `401`.
- End-to-end login remains unverified. `.env.local` has `AUTH_SECRET` and the
  token-encryption key, but `DATABASE_URL` and the existing client's token
  authentication settings are not configured. The local callback is not
  registered with Stalwart.
- The existing `webmail` client and server-wide registration policy were not
  changed. `requireClientRegistration` and `anonymousClientRegistration` remain
  unchanged; the missing `stalwart-webui` record is deferred hardening, not an
  MVP blocker.

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
- No external service or mail-server configuration was changed, and no message
  was sent or mutated.

## Remaining Phase 1 follow-up

Configure the shared PostgreSQL database and the existing `webmail` client's
token-auth method and secret if applicable. Then exercise the registered
production callback in a browser and verify login, session persistence, refresh
or bounded expiration, logout, and OAuth-token `Mailbox/get`. Keep all global
Stalwart registration settings unchanged and do not begin Phase 2 before this
verification succeeds.
