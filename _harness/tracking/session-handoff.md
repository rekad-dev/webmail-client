---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## Current status

Phase 0 is complete. The minimal Next.js shell, strict TypeScript setup, and
local read-only JMAP proof of concept are implemented. Public session discovery
and the advertised endpoint trust checks succeed. Authenticated `Mailbox/get`
passed against Stalwart with the dedicated local test account, returning 5
mailboxes.

## Next safe step

Phase 1 planning has started. Continue with the OAuth Authorization Code +
PKCE plan in the Traycer artifact. The public metadata and expected callbacks
are known. The new `STALWART_OAUTH_ADMIN_API_KEY` authenticates, but it includes
client create/update permissions and lacks provider-get/client-list permissions
despite being supplied for a read-only audit. `x:OAuthClient/get` with
`ids: null` returned a `webmail` record with an Auth.js-shaped callback, while
this repo has no Auth.js callback code. A subsequent unfiltered
`x:OAuthClient/query` returned one ID, which resolves to `webmail`; the query
result did not include `stalwart-webui`. The global provider settings remain
unread because `sysOidcProviderGet` is missing. Replace/restrict the key to
read-only provider-get and client query/get permissions, then confirm
ownership/callback intent before changing client records. Keep
`requireClientRegistration` unchanged until the working flow is complete and
the user explicitly approves a proposed global change. Do not assume the
current `anonymousClientRegistration` value.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub access could not resolve raw.githubusercontent.com. The local antislop skill is therefore a clearly attributed project adaptation, not a verbatim upstream package install. A Vercel React best-practices skill was researched as a useful optional addition but could not be installed in this environment.

