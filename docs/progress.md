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
  `200`. Stalwart's public OIDC discovery document also returned `200` from the
  shell. The provider-specific sign-in route returned an empty `500` before
  redirecting to Stalwart, so no credentials or mailbox data were accessed.
- The production hostname resolves, but the Vercel CLI cannot map it to a
  project in its active scope and no project is linked in this checkout. The
  function log for the failing route is therefore unavailable; end-to-end
  login remains blocked pending project access and diagnosis.
- Latest verification passed: 15 tests, `pnpm typecheck`, and `pnpm build`.
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

Resolve the Vercel provider sign-in `500` using the function log, then repeat
the approved isolated login flow at the registered production callback and
verify session persistence, refresh or bounded expiration, logout, and
OAuth-token `Mailbox/get`. Keep all global Stalwart registration settings
unchanged and do not begin Phase 2 before this verification succeeds.
