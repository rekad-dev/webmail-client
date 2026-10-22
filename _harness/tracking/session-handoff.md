---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## Current status

Phase 0 is complete. Phase 1 has a working implementation checkpoint but is
not complete because end-to-end login has not been tested. Auth.js uses the
existing `webmail` client and exact registered callback
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

The local environment has `AUTH_SECRET` and an OAuth-token encryption key, but
no `DATABASE_URL`; it also lacks the existing `webmail` client's token-auth
method/secret configuration. Configure these as appropriate, then run browser
login using the production callback and verify session persistence, refresh or
bounded access-token expiry, logout, and OAuth-token `Mailbox/get`. Localhost
callback URIs are not registered with Stalwart. Do not start Phase 2 until the
end-to-end login succeeds.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.
