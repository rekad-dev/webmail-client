---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## Current status

Phase 0 and Phase 1 are complete. Phase 2 inbox/mailbox listing is implemented
locally. The authenticated `/api/mail` route verifies the JMAP primary account
against the app session, validates selected mailboxes against that account,
and returns only mailbox counts plus paginated sender/subject/date/unread/plain
preview fields. The React inbox provides mailbox selection, previous/next page,
manual refresh, empty/loading/error states, and the existing sign-out action.
The configured dedicated test account has an empty inbox, so no sample messages
are presented.

Phase 2 local verification passed: all 45 tests, `pnpm typecheck`, `pnpm build`,
and a live read-only `pnpm jmap:smoke` result of five mailboxes, zero inbox IDs,
and zero summaries. An unauthenticated local request to `/api/mail` returned
`401 sign_in_required` with `Cache-Control: no-store` and `Vary: Cookie`.
Deployment and shared-browser verification have not been approved or run, so
Phase 2 remains in progress. Pagination is covered by tests but the current
inbox has no messages to paginate.

Phase 0 and Phase 1 are complete. Production Authorization Code + PKCE sign-in
now succeeds with the existing `webmail` client and exact registered callback
`https://webmail.rekad.id/api/auth/callback/stalwart`. It performs PKCE/state/
nonce checks, validates the OIDC identity, verifies OAuth-token JMAP mailbox
access, and stores encrypted tokens in PostgreSQL behind an encrypted Auth.js
session cookie.

On 2026-10-23, production verification confirmed an authenticated app session,
OAuth-backed `Mailbox/get`, an expiry within the eight-hour app limit, and
logout that cleared the browser session and deleted the recent PostgreSQL
session row. No mailbox contents were returned or mutated.

On 2026-10-24, guarded production logout was verified from a signed-in session:
`/api/auth/session` was populated and `/api/auth/status` returned
`authenticated: true` and `mailboxAccess: true`; after the CSRF-protected
same-origin Auth.js sign-out POST, the session endpoint returned `null` and
status returned `401`. The built-in Auth.js confirmation form POST had
`Origin: null` in ego-browser and was correctly rejected with `403`; that
request left the session unchanged. The standard same-origin client flow
passed without relaxing the origin guard. The browser was left signed out.

On 2026-10-24, production account isolation passed in the shared browser. The
second dedicated test account had an active `/api/auth/session` and
`/api/auth/status` returned `200` with `authenticated: true` and
`mailboxAccess: true`. Signing it out returned the session endpoint to `null`
and status to `401`. The first configured dedicated test account then signed
in successfully; its session identity differed from the second account, and
its status also returned `200` with mailbox access. The browser is currently
signed in as the first test account. No message data was read and no mailbox
state was changed. During the first account's login, an agent-side parsing bug
caused one rejected credential attempt; Stalwart showed its generic invalid
username-or-password response, and the corrected configured credentials
succeeded without creating an app session for the rejected attempt.

On 2026-10-24, production natural-expiry refresh verification passed. The prior
access-token expiry was in the ~03:53 UTC window. After that window, read-only
session metadata showed the active access token expiring at 04:53:10 UTC with a
refresh token present. In the shared browser, `/api/auth/session` returned
HTTP `200` with an unexpired app session and `/api/auth/status` returned HTTP
`200` with `authenticated: true` and `mailboxAccess: true`. No token or
database state was modified to force refresh. No mailbox contents were read,
and browser control was returned with the first test account signed in.

The Phase 1 home page now starts the existing `stalwart` OAuth flow with a
server-side sign-in action and shows an active-session confirmation after
callback. The sign-in-page update was first deployed as
`dpl_6qeqHit7E4jQEYKDv2ejF7yYRwts`; the current release is
`dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. Read-only
HTTP verification confirmed the anonymous page contains the sign-in button and
returns `200`. Mailbox browsing remains Phase 2.

The signed-in home state now includes an accessible CSRF-protected sign-out
button. Commit `c9d8511` passed 22 tests, `pnpm typecheck`, and `pnpm build`;
production deploy `dpl_5JWtuf37v19z7CAiUoUSr38nkgar` is ready at
`https://webmail.rekad.id`. After deployment, the anonymous home page returned
`200`, the sign-in button was present, `/api/auth/session` returned `null`, and
`/api/auth/status` returned `401`. On 2026-10-24, the user signed in again and
the deployed sign-out button was clicked: the active session had mailbox
access before the click; afterward the app returned to the sign-in page,
`/api/auth/session` was `null`, `/api/auth/status` was `401`, and no error
message appeared. The browser was left signed out at the sign-in page.

For future Vercel CLI deployments, this repository is linked to the existing
`rekad/webmail-client` project. The first deployment attempt created a separate
`rekad/mail-client` project because the directory was not linked yet. On
2026-10-24, that extra project was deleted. Vercel's project and alias listings
now show only `rekad/webmail-client` and its aliases, including
`webmail.rekad.id`; neither `mail-client-nine.vercel.app` nor the extra
project's generated alias remains.

After the implementation review, refresh now preserves the application session
for transport, server, and malformed-response failures; an explicit
`invalid_grant` revokes it. Basic client credentials are form-encoded before
Base64 encoding. Expired rows are opportunistically removed on sign-in and
session lookups. This sweep has no scheduled runner yet, so dormant expired
rows can remain until the database is accessed again. The Auth.js sign-out POST
now checks the trusted app origin and revokes the app session before handing
the request to Auth.js. Session-ID lookup or deletion failures return `503`
without clearing the cookie, and cross-origin requests return `403`. Local
tests cover these behaviors. The guarded logout change was deployed as
`dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS`; the current page release is
`dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. The guarded
logout flow passed end to end on production; a production database outage was
not simulated.

No Stalwart OAuth client or global setting was changed. Keep
`requireClientRegistration` and `anonymousClientRegistration` unchanged. The
missing `stalwart-webui` record is a future hardening prerequisite and not an
MVP blocker. The admin API key is never used for app authentication or mailbox
access. The provider-settings audit can remain deferred.

## Next safe step

After the user explicitly approves deployment and browser use, deploy the
local Phase 2 implementation to the existing `rekad/webmail-client` project
and verify it at `https://webmail.rekad.id` using the signed-in dedicated
account. Check that real mailboxes load, the empty inbox is rendered, selecting
a mailbox stays within that account, and manual refresh retries successfully.
Pagination can be exercised when a populated dedicated test mailbox is
available. Keep Phase 3 pending; do not read full message bodies, mutate mailbox
state, or change Stalwart settings. Keep `requireClientRegistration` and
`anonymousClientRegistration` unchanged; do not use the admin API key for app
authentication or mailbox access.

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.
