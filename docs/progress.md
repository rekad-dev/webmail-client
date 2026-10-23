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
- The Auth.js sign-out POST now checks the trusted app origin and revokes the
  server-side session before delegating to Auth.js to clear its cookie. If
  session-ID lookup throws or PostgreSQL revocation fails, it returns `503`
  without invoking Auth.js, so the browser can retry. Cross-origin sign-out is
  rejected. Unit tests cover ordering and both failure paths. This change is
  deployed to production as `dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS` at
  `https://webmail.rekad.id`; the new route's normal production logout check is
  pending a fresh test-account sign-in. No production database outage was
  simulated.
- Local route checks passed: provider discovery returned `stalwart` with the
  expected callback shape; session returned `null`; unauthenticated mailbox
  status returned `401`.
- `.env.local` now contains `AUTH_STALWART_ID`, the existing client's secret
  and token-auth method, and `DATABASE_URL`. The configured client ID matches
  `webmail`; the idempotent migration created the app-owned session table and
  expiry index in PostgreSQL.
- Production Vercel deployment `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY` is aliased
  to `https://webmail.rekad.id`. Its callback diagnostics exposed the
  `validate_oauth_response` stage. Installed Auth.js source showed that
  `user.id` is a generated app ID while `account.providerAccountId` is the OIDC
  subject; reviewed commit `58f5ccd` removed the invalid equality check.
- End-to-end production verification passed on 2026-10-23. The browser returned
  to the app with an active session; `/api/auth/status` returned `200` with
  `authenticated: true` and `mailboxAccess: true`, confirming OAuth-token
  read-only `Mailbox/get`. The session expiry was in the future and within the
  eight-hour app limit.
- Before logout, a read-only production database aggregate found one recent
  active session row. Auth.js sign-out returned the browser to anonymous state:
  `/api/auth/session` returned `200` with no session, `/api/auth/status`
  returned `401`, and the same aggregate found zero recent session rows.
  No mailbox data was returned or mutated.
- `pnpm test` (22 passing), `pnpm typecheck`, and `pnpm build` passed. No
  Stalwart client/global registration setting changed, and the admin API key
  was not used for application authentication or mailbox access.
- Phase 1 remains active for invalid-credential handling, multi-account
  isolation, forced refresh behavior, and production verification of the new
  guarded logout path after sign-in. Do not begin Phase 2 automatically.
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

Complete invalid-credential handling, forced refresh verification, and
multi-account isolation when the second dedicated test account is ready.
Deploy and verify the guarded logout path before closing Phase 1. Keep Phase 2
pending and all global Stalwart registration settings unchanged until Phase 1
is closed.
