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

Phase 1 will use Stalwart Authorization Code + PKCE S256. The public webmail
origin is `https://webmail.rekad.id`, and the Stalwart issuer is
`https://mail.rekad.id`; the app callback is
`https://webmail.rekad.id/auth/callback`. The browser authenticates at Stalwart
and the Next.js BFF exchanges the authorization code server-side. The app does
not receive or retain the user's Stalwart password. See the Phase 1 OAuth plan
artifact for the flow, registration, and preflight details.

The application session should use an opaque identifier in a secure,
HTTP-only, same-site cookie. OAuth access and refresh tokens must remain in a
server-side session store and be protected at rest. Do not place Stalwart
credentials or tokens in browser JavaScript, local storage, or client-visible
cookies. Vercel is the target host, so OAuth transactions and sessions require
a shared durable store rather than function memory or local disk. PostgreSQL
is the current default candidate; the provider remains configurable.

The live unfiltered OAuth client query returned one existing `webmail` record
with `https://webmail.rekad.id/api/auth/callback/stalwart`; this repo has no
matching Auth.js callback implementation. Preserve that record until its
ownership and intended callback are confirmed. The query result did not include
`stalwart-webui`. The current key cannot read OIDC provider settings and has
client create/update permissions despite being supplied for a read-only audit.
`requireClientRegistration` is optional server-wide hardening: do not change it
until the app flow works, current settings and clients are audited, and the
user explicitly approves the exact change. Also inspect the live
`anonymousClientRegistration` value before recommending hardening.

## Phase 0 proof of concept

The local `pnpm jmap:discover` and `pnpm jmap:smoke` commands run outside the
browser. They validate JMAP discovery URLs and, when explicitly configured with
a dedicated test account, perform a read-only `Mailbox/get`. The smoke command
does not log authentication headers, credentials, message content, mailbox
names, or raw server responses.

The sample public endpoint uses HTTPS. Private HTTP is rejected unless
`STALWART_JMAP_ALLOW_INSECURE_HTTP=true`, and then only for private/local host
names or addresses that are explicitly configured as trusted origins.
