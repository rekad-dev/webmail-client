---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## Current status

Phase 0 is complete. Production Authorization Code + PKCE sign-in now succeeds
with the existing `webmail` client and exact registered callback
`https://webmail.rekad.id/api/auth/callback/stalwart`. It performs PKCE/state/
nonce checks, validates the OIDC identity, verifies OAuth-token JMAP mailbox
access, and stores encrypted tokens in PostgreSQL behind an encrypted Auth.js
session cookie.

On 2026-10-23, production verification confirmed an authenticated app session,
OAuth-backed `Mailbox/get`, an expiry within the eight-hour app limit, and
logout that cleared the browser session and deleted the recent PostgreSQL
session row. No mailbox contents were returned or mutated.

After the implementation review, refresh now preserves the application session
for transport, server, and malformed-response failures; an explicit
`invalid_grant` revokes it. Basic client credentials are form-encoded before
Base64 encoding. Expired rows are opportunistically removed on sign-in and
session lookups. This sweep has no scheduled runner yet, so dormant expired
rows can remain until the database is accessed again. The Auth.js sign-out POST
now checks the trusted app origin and revokes the app session before handing
the request to Auth.js. Session-ID lookup or deletion failures return `503`
without clearing the cookie, and cross-origin requests return `403`. Local
tests cover these behaviors; production deployment and outage-path verification
are pending.

No Stalwart OAuth client or global setting was changed. Keep
`requireClientRegistration` and `anonymousClientRegistration` unchanged. The
missing `stalwart-webui` record is a future hardening prerequisite and not an
MVP blocker. The admin API key is never used for app authentication or mailbox
access. The provider-settings audit can remain deferred.

## Next safe step

The core production login, session persistence, OAuth-backed read-only mailbox
access, bounded expiry, and normal logout paths now pass. Phase 1 remains open
for invalid-credential handling, multi-account isolation, forced refresh
behavior, and production verification of guarded logout failure handling.
Wait for the second dedicated test account before account-isolation testing. Do
not start Phase 2 automatically. Keep `requireClientRegistration` and
`anonymousClientRegistration` unchanged; do not use the admin API key for app
authentication or mailbox access.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.
