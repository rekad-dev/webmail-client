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
- Latest local verification: 15 unit tests, `pnpm typecheck`, `pnpm build`, and
  local production route checks passed. The callback diagnostics are reviewed
  but have not been deployed.
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
- The new local diagnostic log records only a stage, an allowlisted error
  class, and a constrained SQLSTATE/static reason when applicable. Deploying
  it to production requires the user's explicit approval; after deployment,
  retry sign-in to identify and fix the failing stage.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

After approval, deploy the reviewed diagnostics, retry the existing browser
sign-in, fix the callback failure, then verify session persistence, refresh or
bounded access-token expiry, logout, and OAuth-token `Mailbox/get`. Do not begin
Phase 2 before successful end-to-end authentication.
