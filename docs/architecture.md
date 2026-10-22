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
checks; no scheduled cleanup runner is configured. A database failure during
the Auth.js sign-out event remains a known risk because Auth.js clears the
browser cookie even if that event fails.

The user confirmed that the existing `webmail` client is the app client; its
registered callback matches this implementation. The audit did not find
`stalwart-webui`, which remains a future hardening prerequisite and does not
block the webmail MVP. The live values of `requireClientRegistration` and
`anonymousClientRegistration` have not been re-read in this implementation
milestone; both remain unchanged. Do not change either setting without a
separate review and the user's explicit approval. The admin API key is not used
by application authentication or mailbox access.

The implementation is in place and the local Auth.js provider/session/status
routes have been checked. A real login is still pending: local configuration
does not contain `DATABASE_URL` or the existing client's token-auth method and
secret (if required), and local callback URLs are not registered with Stalwart.
The production callback above is the one to use for end-to-end verification.

## Phase 0 proof of concept

The local `pnpm jmap:discover` and `pnpm jmap:smoke` commands run outside the
browser. They validate JMAP discovery URLs and, when explicitly configured with
a dedicated test account, perform a read-only `Mailbox/get`. The smoke command
does not log authentication headers, credentials, message content, mailbox
names, or raw server responses.

The sample public endpoint uses HTTPS. Private HTTP is rejected unless
`STALWART_JMAP_ALLOW_INSECURE_HTTP=true`, and then only for private/local host
names or addresses that are explicitly configured as trusted origins.
