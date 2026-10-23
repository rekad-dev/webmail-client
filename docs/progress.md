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
- Refresh transport/server/malformed-response failures preserve the session
  for retry; an explicit OAuth `invalid_grant` deletes it. Basic client
  credentials are form-encoded before Base64. Expired rows are removed during
  sign-in and session checks, but there is no scheduled cleanup runner.
- Logout still has a failure edge: Auth.js clears its cookie even when the
  sign-out event fails, so a copied cookie can remain usable if PostgreSQL
  could not delete the server row. A retry-safe sign-out route needs a separate
  design.
- Local route checks passed: provider discovery returned `stalwart` with the
  expected callback shape; session returned `null`; unauthenticated mailbox
  status returned `401`.
- `.env.local` now contains `AUTH_STALWART_ID`, the existing client's secret
  and token-auth method, and `DATABASE_URL`. The configured client ID matches
  `webmail`; the idempotent migration created the app-owned session table and
  expiry index in PostgreSQL.
- Production route checks on 2026-10-23 returned providers `200`, anonymous
  session `200`, unauthenticated status `401`, generic sign-in `200`, and CSRF
  `200`. The user then signed in at Stalwart and returned to the registered
  callback. Auth.js reached its JWT callback, so code exchange and OIDC profile
  processing completed, but the callback returned `500`; the subsequent
  session check returned `200` without an authenticated session.
- Vercel logs show an Auth.js `CallbackRouteError` during the JWT callback and
  an underlying `TypeError: immutable`. The currently deployed handler logs
  only a generic error, so the failing finalization stage remains unknown.
  Production auth environment metadata and the app session table/permissions
  were checked read-only. No successful app-level mailbox check has been
  verified.
- A reviewed diagnostics change adds stage and allowlisted error-class logging
  while omitting raw errors, identities, and credentials. It passed 15 tests,
  `pnpm typecheck`, and `pnpm build`; after explicit approval it was deployed
  to production as `dpl_A3TtY6Duyt6FLqbk6TPhtodq1Re9`, aliased to
  `https://webmail.rekad.id`.
- The retry currently shows Stalwart's username/password form in the existing
  browser page. The user must sign in before the callback and new diagnostic
  stage can be inspected; the agent did not enter credentials.
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
- No Stalwart or mail-server setting was changed, and no message was sent or
  mutated. The configured PostgreSQL database received only the app-owned,
  idempotent OAuth-session table/index migration.

## Remaining Phase 1 follow-up

After the user completes sign-in in the existing browser page, inspect the
callback stage, fix the failure, then verify session persistence, refresh or
bounded access-token expiry, logout, and OAuth-token `Mailbox/get`. Keep all
global Stalwart registration settings unchanged and do not begin Phase 2 before
this verification succeeds.
