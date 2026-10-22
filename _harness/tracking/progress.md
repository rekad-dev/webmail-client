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
- Local route checks passed: provider discovery reports `stalwart` and the
  expected callback shape; the empty session is `null`; unauthenticated status
  is `401`.
- Full browser login is not verified. Local `DATABASE_URL` and existing client
  token authentication configuration (method and secret, if required) are
  missing, and localhost callback URIs are not registered.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

Configure the shared PostgreSQL URL and the existing `webmail` client's token
authentication method/secret if required. Then complete browser-based login at
the registered production callback and verify session persistence, refresh or
bounded access-token expiry, logout, and OAuth-token `Mailbox/get`. Do not begin
Phase 2 before successful end-to-end authentication.
