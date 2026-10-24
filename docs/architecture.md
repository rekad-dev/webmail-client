# Architecture

## Product boundary

This application is a webmail client. Stalwart owns accounts, mailboxes,
messages, and submission; Mailjet remains the outbound relay. The application
does not implement mail-server responsibilities or an SMTP client.

## Request flow

```text
Browser
  -> Next.js App Router (UI and authenticated Route Handlers)
  -> server-only JMAP client
  -> Stalwart JMAP session/API URLs discovered at runtime
  -> existing mail infrastructure
```

The browser will call only application endpoints. Stalwart credentials and JMAP
tokens stay on the server. Each operation must derive its account from the
authenticated session, authorize that account, validate inputs, and return only
the data needed by the UI.

## Stalwart connectivity

The configured starting point is `STALWART_JMAP_SESSION_URL`; it is not a
hard-coded proxy target. JMAP discovery currently succeeds at
`https://mail.rekad.id/.well-known/jmap`, which redirects to
`https://mail.rekad.id/jmap/session`. The returned API, upload, download, and
event-source URLs use the same origin today.

The JMAP client must validate discovery redirects and every advertised endpoint
against `STALWART_JMAP_TRUSTED_ORIGINS`. A deployment with separate internal and
public endpoints must configure each trusted origin explicitly. It must not
accept arbitrary URLs from client input or proxy arbitrary destinations.

The public TLS endpoint works from this workstation. Private connectivity from
the eventual application host has not been established. An internal endpoint
may be used once its reachability and TLS/network boundary are confirmed; no
infrastructure has been changed.

## Authentication direction

Phase 1 uses Stalwart Authorization Code + PKCE S256. The public webmail
origin is `https://webmail.rekad.id`, and the Stalwart issuer is
`https://mail.rekad.id`. Auth.js uses provider ID `stalwart`, so the callback
is the existing registered URI
`https://webmail.rekad.id/api/auth/callback/stalwart`. The existing Stalwart
client ID `webmail` is reused; no client was created or changed. Auth.js
handles the server-side code exchange and PKCE, state, and nonce checks. The
app does not receive or retain the user's Stalwart password. See the Phase 1
OAuth plan artifact for the flow, registration, and preflight details.

Auth.js sets an encrypted, HTTP-only, same-site cookie containing only an
opaque application session reference. OAuth access and refresh tokens remain
server-side in PostgreSQL and are protected at rest with AES-256-GCM. The
server stores only a hash of the session reference and encrypted token data.
Do not place Stalwart credentials or tokens in browser JavaScript, local
storage, or client-visible session values. `DATABASE_URL` must point to a
shared durable PostgreSQL service for deployment; function memory and local
disk are not session stores.

Refresh keeps the session on network, server, or malformed-response failures
so a later request can retry; only an explicit OAuth `invalid_grant` removes the
session. Expired rows are opportunistically swept during sign-in and session
checks; no scheduled cleanup runner is configured. The Auth.js sign-out POST
now verifies the app origin and revokes the server row before delegating to
Auth.js to clear the cookie. If session-ID lookup or revocation throws, it
returns `503` without invoking Auth.js, leaving the cookie available for a
retry. This path is covered by local unit tests and deployed as
`dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS` at `https://webmail.rekad.id`. Its normal
production logout, account-isolation, and natural-expiry refresh checks passed;
no production database outage was simulated.

The user confirmed that the existing `webmail` client is the app client; its
registered callback matches this implementation. The audit did not find
`stalwart-webui`, which remains a future hardening prerequisite and does not
block the webmail MVP. The live values of `requireClientRegistration` and
`anonymousClientRegistration` have not been re-read in this implementation
milestone; both remain unchanged. Do not change either setting without a
separate review and the user's explicit approval. The admin API key is not used
by application authentication or mailbox access.

The local Auth.js provider/session/status routes have been checked. In
production, Auth.js completed the registered OAuth callback, `/api/auth/session`
returned an active session, and `/api/auth/status` returned `200` with
`authenticated: true` and `mailboxAccess: true`; the status check performs
read-only OAuth-token `Mailbox/get`. The returned session expiry was in the
future and within the eight-hour app cap. After normal sign-out, the session
endpoint returned `200` anonymously, status returned `401`, and a read-only
database aggregate confirmed the recent app session row was deleted.

The first callback diagnostic identified a bad identity comparison: Auth.js
generates `user.id` as an app identifier while `account.providerAccountId`
contains the OIDC subject. Reviewed commit `58f5ccd` removed that check and is
deployed as `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY`. No mailbox data was returned or
mutated during Phase 1. Phase 1 is complete. Production login,
invalid-credential rejection, multi-account isolation, natural-expiry refresh,
and guarded logout passed. Phase 2 read-only mailbox listing is complete and
deployed as `dpl_DbN32jRh6FHVYRmV83AWC9JP1uBj` at
`https://webmail.rekad.id`. No Stalwart client or global registration setting
was changed.

## Phase 2 mailbox listing

The authenticated `GET /api/mail` route reads the opaque app-session reference
from the Auth.js cookie and loads the OAuth access token and account ID from the
server-side session store. The JMAP session's primary mail account must match
that stored account ID before `Mailbox/get`, `Email/query`, or `Email/get` is
sent. A requested mailbox ID is accepted only when it appears in that same
account's mailbox list. Account mismatch revokes the app session.

The route requests mailbox ID, name, role, total count, and unread count. It
queries a fixed 25-message page newest-first and fetches only sender, subject,
received date, keywords, and plaintext preview. It does not request body values,
HTML, or attachment data. Responses are application-shaped, uncached, and vary
by cookie. The browser receives no Stalwart token, JMAP account ID, or raw JMAP
response. The dedicated account's production read-only check found five
mailboxes and an empty inbox, so the UI rendered the real empty state. The
signed-in production browser check confirmed mailbox selection, return to
Inbox, and manual refresh. Live message-row display and pagination could not be
exercised because the test inbox contains no messages; JMAP summary mapping,
route pagination input, and the page-position cap are covered by tests.

## Phase 3 safe email reading

The detail API is `GET /api/mail/detail?emailId=...`; it derives the OAuth
token and JMAP primary mail account from the app session. The JMAP client
checks that account against the session, requests only sender/recipient,
subject/time, read state, text and HTML body values, attachment metadata, and
mailbox IDs, and bounds both body values and the full API response. It returns
an application-shaped object with server-sanitized HTML and validated external
links. It never returns a body-part blob ID or attachment bytes.

HTML uses a strict server-side allowlist. Images, styles, scripts, forms,
frames, event attributes, and unsafe URL schemes are removed. Body links are
inert; allowed HTTP, HTTPS, and mailto destinations are listed outside the
message frame. The UI places sanitized HTML in a sandboxed iframe with a
restrictive content security policy and renders plaintext through React text
escaping. Remote resources remain blocked.

Opening a message loads the body first, then issues a same-origin authenticated
`POST /api/mail/detail?emailId=...` to patch only `keywords/$seen`. The route
checks the app origin and account binding and revokes the app session on JMAP
account mismatch. A failed read-state update leaves the body readable and
reports that the message remains unread. Attachment name, type, and size are
displayed; attachment downloads are outside Phase 3.

Local tests (63/63), type checking, and production build pass. Review findings
were resolved: development read-state requests require an exact same origin,
opening and closing a message moves and restores keyboard focus, and a pending
read-state update reconciles or refreshes the retained list. The dedicated
Stalwart account currently has an empty Inbox, so real body display and the
live read mutation remain unverified. No production deployment or browser
session check has been performed for Phase 3.

## Phase 0 proof of concept

The local `pnpm jmap:discover` and `pnpm jmap:smoke` commands run outside the
browser. They validate JMAP discovery URLs and, when explicitly configured with
a dedicated test account, perform read-only `Mailbox/get`, `Email/query`, and
summary-only `Email/get`. The smoke command reports counts only; it does not
log authentication headers, credentials, message content, mailbox names, or
raw server responses.

The sample public endpoint uses HTTPS. Private HTTP is rejected unless
`STALWART_JMAP_ALLOW_INSECURE_HTTP=true`, and then only for private/local host
names or addresses that are explicitly configured as trusted origins.
