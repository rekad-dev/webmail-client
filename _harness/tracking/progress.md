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
  passed. The reviewed diagnostics and OIDC subject fix are deployed to
  Vercel production as `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY` at
  `https://webmail.rekad.id`.
- Production callback diagnostics identified the `validate_oauth_response`
  failure: Auth.js assigns `user.id` a random app ID, while
  `account.providerAccountId` is the OIDC subject. Reviewed commit `58f5ccd`
  removed the invalid equality check.
- End-to-end production verification passed: Auth.js returned to the app,
  `/api/auth/session` returned an active session, and `/api/auth/status`
  returned `200` with `authenticated: true` and `mailboxAccess: true`. This
  status check performs OAuth-token `Mailbox/get` and returns only booleans.
- Session expiry was future-dated and within the eight-hour app limit. A
  read-only production DB aggregate found one recent active session before
  logout. Auth.js sign-out then returned the browser to anonymous state
  (`/api/auth/session` `200`, `/api/auth/status` `401`) and the same aggregate
  showed zero recent session rows afterward.
- No mailbox content was returned, no message or mailbox was mutated, and no
  Stalwart client or global registration setting was changed. The admin key
  was not used for application authentication or mailbox access.
- Phase 1 remains active for invalid-credential handling, multi-account
  isolation, forced refresh behavior, and the database-failure logout path.
  The normal production login, mailbox-access, bounded-expiry, and logout paths
  have passed; do not begin Phase 2 automatically.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

Complete remaining Phase 1 acceptance checks for invalid credentials and
multi-account isolation, and address the known logout database-failure path.
Keep Phase 2 pending until Phase 1 is closed; do not change global Stalwart
registration settings.
