---
role: agent-tracking
scope: progress
---

# Progress

## Current state

- Phase 0 is complete. The minimal Next.js App Router shell and local JMAP
  proof of concept are implemented.
- Public JMAP session discovery succeeds and validates the advertised API,
  upload, download, and event-source origins.
- Automated checks passed: 7 focused tests, typecheck, and production build.
- Authenticated `Mailbox/get` passed against Stalwart using the dedicated local
  test account and returned 5 mailboxes (`drafts`, `inbox`, `junk`, `sent`,
  `trash`).
- The repository has no Git metadata; the harness instructions say not to
  initialize Git solely to make micro-commits.

## Next

Phase 0's real-server acceptance check is reviewed and complete. The Phase 1
Authorization Code + PKCE plan is drafted in the Traycer artifact. Public
metadata and the expected admin/account callback routes have been checked. The
live `requireClientRegistration` and `anonymousClientRegistration` values and
global registration policy remains unknown. No Stalwart OAuth client or global
setting has been changed. The newly configured admin key authenticates, but it
is not read-only: its effective permissions include `sysOAuthClientGet`,
`sysOAuthClientCreate`, and `sysOAuthClientUpdate`, but not
`sysOidcProviderGet`. Its account flags report `sysOAuthClientList=false`,
although the documented read-only `x:OAuthClient/query` call succeeded. The
unfiltered query returned one ID; fetching it returned the `webmail` record
with callback
`https://webmail.rekad.id/api/auth/callback/stalwart`; it did not include
`stalwart-webui`. This callback does not match the planned route, and the repo
has no Auth.js callback implementation. No write method was called.

Next, replace or restrict the admin key to read-only permissions
(`authenticate`, `sysOidcProviderGet`, `sysOAuthClientQuery`,
`sysOAuthClientGet`) and remove client-create/update. Finish the provider
settings audit, then confirm whether `webmail` is the intended app client
before creating or changing any client record. Implement and verify
the working authentication flow with global policy unchanged. Consider optional
`requireClientRegistration` hardening only after the flow works and the user
explicitly approves a reviewed server-wide change.

