---
role: agent-tracking
scope: progress
---

# Progress

## Phase 1 authentication in progress

- Auth.js OIDC login is implemented for the existing Stalwart client `webmail`.
- The home page now has a server-side “Sign in with Stalwart” action and shows
  a signed-in state after the OAuth callback; mailbox browsing remains Phase 2.
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
- The Auth.js sign-out POST now checks the trusted app origin and revokes the
  server-side session before delegating to Auth.js to clear the cookie. A
  session-ID lookup or database failure returns `503` without invoking Auth.js;
  cross-origin requests return `403`. Local tests cover ordering and failure
  behavior. The guarded logout code was deployed as
  `dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS`. The current production deployment,
  including the home-page sign-in action, is
  `dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. On
  2026-10-24, the signed-in production session and OAuth-backed mailbox access
  were confirmed; after the CSRF-protected same-origin Auth.js sign-out POST,
  `/api/auth/session` returned `null` and `/api/auth/status` returned `401`.
  The built-in Auth.js confirmation form POST had `Origin: null` in ego-browser
  and received `403` without changing the session; the standard client flow
  from the app origin passed with the origin guard intact. No production
  database outage was simulated.
- Added an accessible signed-in “Sign out” control using Auth.js `signOut`,
  with pending and retry-error states. Commit `c9d8511` passed all 22 tests,
  `pnpm typecheck`, and `pnpm build`, then deployed as
  `dpl_5JWtuf37v19z7CAiUoUSr38nkgar`. The anonymous home page returned `200`
  with the sign-in button; after logout, `/api/auth/session` returned `null`
  and `/api/auth/status` returned `401`. On 2026-10-24, the user signed in
  again and clicked the deployed sign-out button. The active session had
  mailbox access before the click; afterward the app returned to the sign-in
  page, `/api/auth/session` was `null`, `/api/auth/status` was `401`, and no
  error message appeared. The browser was left signed out.
- Production account isolation passed on 2026-10-24 in the shared browser. The
  second dedicated test account had a populated `/api/auth/session`, and
  `/api/auth/status` returned `200` with `authenticated: true` and
  `mailboxAccess: true`. Signing out the second account returned the session
  endpoint to `null` and status to `401`. The configured first dedicated test
  account then signed in successfully; the two session email identities
  differed, and the first account's status returned `200` with mailbox access.
  The browser is signed in as the first test account. No message data was read
  or mailbox state changed. A parsing mistake caused one rejected credential
  attempt before the corrected login; no app session was created by that
  attempt.
- Deleted the accidental Vercel project `rekad/mail-client`. The requested
  `mail-client-nine.vercel.app` alias and its generated project alias are now
  absent; `rekad/webmail-client` and `webmail.rekad.id` remain.
- Local route checks passed: provider discovery reports `stalwart` and the
  expected callback shape; the empty session is `null`; unauthenticated status
  is `401`.
- `AUTH_STALWART_ID`, the existing client's secret and token-auth method, and
  `DATABASE_URL` are now configured locally. The ID matches `webmail`; the
  idempotent migration created the application session table and expiry index.
- Latest local verification: 22 unit tests, `pnpm typecheck`, and `pnpm build`
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
- Phase 1 remains active for invalid-credential handling and forced refresh
  behavior; multi-account isolation passed. The normal production login,
  mailbox-access, bounded-expiry, and logout paths have passed; do not begin
  Phase 2 automatically.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

Complete the remaining Phase 1 acceptance checks for invalid credentials and
forced refresh. Multi-account isolation is verified.
Keep Phase 2 pending until Phase 1 is closed; do not change global Stalwart
registration settings.
