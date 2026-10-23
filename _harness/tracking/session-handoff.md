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

The local environment now has `AUTH_STALWART_ID=webmail`, the existing client's
token-auth settings, and `DATABASE_URL`. The idempotent migration applied the
application-owned session table and expiry index. Production now resolves:
providers, anonymous session, generic sign-in, CSRF, and public OIDC discovery
checks succeeded, while unauthenticated status returned `401`. The
provider-specific sign-in route returned an empty `500` before OAuth began. No
credentials were entered and no mailbox request was made. The Vercel CLI cannot
map the hostname to a project in its active scope, and this checkout has no
linked project. The user supplied a project ID, but Vercel reports it is not
found under the active team; the CLI lists only `crlnravels-projects`. Get the
owning account/team scope or a redacted function log, inspect the failure, then
retry the same approved isolated flow and verify session persistence, refresh
or bounded expiry, logout, and OAuth-token `Mailbox/get`. Do not start Phase 2
until the end-to-end login succeeds.

Ego Lite reported an available update. Do not run `ego-browser upgrade` unless
the user approves it. No login credentials were entered and no mailbox data was
accessed during the failed browser attempt.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.
