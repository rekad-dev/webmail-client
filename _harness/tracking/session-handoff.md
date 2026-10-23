---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## Current status

Phase 0 is complete. Phase 1 has a working implementation checkpoint but is
not complete because end-to-end login failed during callback finalization.
Auth.js uses the existing `webmail` client and exact registered callback
`https://webmail.rekad.id/api/auth/callback/stalwart`. It performs PKCE/state/
nonce checks, validates the OIDC identity, verifies OAuth-token JMAP mailbox
access, and stores encrypted tokens in PostgreSQL behind an encrypted Auth.js
session cookie.

After the implementation review, refresh now preserves the application session
for transport, server, and malformed-response failures; an explicit
`invalid_grant` revokes it. Basic client credentials are form-encoded before
Base64 encoding. Expired rows are opportunistically removed on sign-in and
session lookups. This sweep has no scheduled runner yet, so dormant expired
rows can remain until the database is accessed again. Auth.js clears its cookie
even when the sign-out event fails; the replayable-row failure path still needs
a dedicated design and remains unverified.

No Stalwart OAuth client or global setting was changed. Keep
`requireClientRegistration` and `anonymousClientRegistration` unchanged. The
missing `stalwart-webui` record is a future hardening prerequisite and not an
MVP blocker. The admin API key is never used for app authentication or mailbox
access. The provider-settings audit can remain deferred.

## Next safe step

On 2026-10-23, the user signed in at Stalwart and the browser returned to the
registered callback. Auth.js reached its JWT callback, so the authorization
code exchange and OIDC profile processing completed. The callback returned
HTTP `500`; the browser then reported no app session. A production Vercel log
shows `CallbackRouteError` during the JWT callback with an underlying
`TypeError: immutable`, but the deployed handler replaces the cause with a
generic error and does not identify which finalization stage failed. Production
environment and database-session schema/permissions were checked read-only.

The callback diagnostics passed 15 tests, typecheck, and production build, were
reviewed, and were deployed to production on 2026-10-23 as
`dpl_A3TtY6Duyt6FLqbk6TPhtodq1Re9`, aliased to `https://webmail.rekad.id`.
They log a bounded stage and allowlisted error class without credentials,
identities, or server-supplied error text. On retry, Stalwart displayed its
username/password form, so the user must sign in from the existing browser page
before the callback can be diagnosed. After the user returns from that login,
inspect the stage, fix the cause, then verify session persistence, OAuth-token
`Mailbox/get`, refresh or bounded expiry, and logout. Do not start Phase 2
until end-to-end authentication succeeds. Keep all Stalwart global settings
unchanged.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.
