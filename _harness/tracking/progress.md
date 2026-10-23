---
role: agent-tracking
scope: progress
---

# Progress

## Phase 1 authentication in progress

- Auth.js OIDC login is implemented for the existing Stalwart client `webmail`.
- The callback is the registered exact URI
  `https://webmail.rekad.id/api/auth/callback/stalwart`.
- The callback requires PKCE, state, and nonce checks, validates the OIDC
  subject, and performs OAuth-token JMAP `Mailbox/get` before creating a
  session.
- PostgreSQL stores a hash of each opaque app-session identifier and AES-GCM
  encrypted access/refresh tokens. The browser session cookie is Auth.js's
  encrypted JWE cookie; no Stalwart token is returned to client JavaScript.
- Refresh failures preserve a session for retry except explicit
  `invalid_grant`; client credentials use OAuth form encoding before Basic
  encoding. Expired rows are swept during sign-in and session checks, with no
  scheduled cleanup runner configured.
- A sign-out database failure is still a known risk: Auth.js clears its cookie
  even when the sign-out event fails, so a copied cookie may continue to resolve
  until the server row expires. A retry-safe logout path needs a separate design.
- Local route checks passed: provider discovery reports `stalwart` and the
  expected callback shape; the empty session is `null`; unauthenticated status
  is `401`.
- `AUTH_STALWART_ID`, the existing client's secret and token-auth method, and
  `DATABASE_URL` are now configured locally. The ID matches `webmail`; the
  idempotent migration created the application session table and expiry index.
- Latest local verification: 15 unit tests, `pnpm typecheck`, and `pnpm build`
  passed. The reviewed callback diagnostics are deployed to Vercel production
  as `dpl_A3TtY6Duyt6FLqbk6TPhtodq1Re9` and aliased to
  `https://webmail.rekad.id`.
- On 2026-10-23, the user completed Stalwart sign-in and returned to the exact
  registered callback. Auth.js reached the JWT callback, confirming the code
  exchange and OIDC profile processing completed, but the callback returned
  `500`. The production browser session endpoint then returned `200` with no
  authenticated session.
- Vercel production logs are available. They show Auth.js `CallbackRouteError`
  during the JWT callback with an underlying `TypeError: immutable`; the
  deployed callback does not log the finalization stage. Production auth
  configuration and PostgreSQL session schema/permissions were checked
  read-only. No mailbox result or successful app session has been verified.
- The deployed diagnostic log records only a stage, an allowlisted error
  class, and a constrained SQLSTATE/static reason when applicable. Its
  production deployment was explicitly approved and completed. The retry is at
  Stalwart's username/password form; the browser needs the user to sign in
  before we can observe the callback stage. No credentials were entered by the
  agent.
- Production diagnostics identified the `validate_oauth_response` stage and
  the fixed incomplete-response reason. Auth.js source confirms it assigns
  `user.id` a random app ID while `account.providerAccountId` comes from the
  OIDC profile subject. The callback incorrectly required those IDs to match;
  that check is removed in reviewed commit `58f5ccd`. The fix passed 15 tests,
  typecheck, and build, then deployed to production as
  `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY` and was aliased to the webmail domain.
- A fresh OAuth attempt after the fix returned to Stalwart's sign-in form.
  The user must sign in again in the same browser page before we can verify the
  fixed callback, app session, JMAP access, refresh, and logout.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

After the user completes sign-in in the existing browser page, verify the
callback and app session, then verify OAuth-token `Mailbox/get`, refresh or
bounded access-token expiry, and logout. Do not begin Phase 2 before successful
end-to-end authentication.
