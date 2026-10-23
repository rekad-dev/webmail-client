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
- Latest verification: 15 unit tests, `pnpm typecheck`, `pnpm build`, and local
  production route checks passed. The approved browser attempt could not reach
  `webmail.rekad.id` because DNS resolution failed, so login and mailbox access
  were not exercised.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

Restore DNS/network reachability for `webmail.rekad.id`, then complete the
already approved browser login at the registered callback and verify session
persistence, refresh or bounded access-token expiry, logout, and OAuth-token
`Mailbox/get`. Do not begin Phase 2 before successful end-to-end authentication.
