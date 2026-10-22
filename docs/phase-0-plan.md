# Phase 0 — Discovery and JMAP proof of concept

## Objective

Prove the BFF-to-Stalwart JMAP connection before adding user-facing mailbox
features. Confirm session discovery, advertised endpoint trust, required
capabilities, and an authenticated read-only `Mailbox/get` for a dedicated test
account.

## Scope

- Establish the smallest Next.js App Router and strict TypeScript foundation.
- Add a local command that runs only on the server and uses a dedicated test
  account from `.env.local`.
- Discover the JMAP session, validate its redirects and advertised API, upload,
  download, and event URLs against configured trusted origins, and run only
  `Mailbox/get`.
- Document the BFF architecture, environment variables, auth direction, phased
  roadmap, and known blockers.

## Files and modules

- `app/`: minimal placeholder page, root layout, and base styling only.
- `lib/jmap/phase0-poc.mts`: JMAP discovery, trusted-origin checks, and read-only
  mailbox request.
- `scripts/jmap-smoke.mts`: local discovery and authenticated smoke commands.
- `tests/jmap-poc.test.mts`: protocol mapping, endpoint allowlist, and credential
  handling tests using local fake responses.
- `docs/architecture.md`, `docs/roadmap.md`, `docs/progress.md`: durable
  architecture decisions and milestone status.
- `README.md`, `.env.example`, `.gitignore`: setup and safe local configuration.

## Technical approach

1. Use the existing public mail hostname only as an explicitly configured
   starting point; let `/.well-known/jmap` discover the session and follow its
   redirect only when the destination is trusted.
2. Require HTTPS by default. Permit HTTP only when explicitly enabled for a
   configured private-network origin.
3. Validate every advertised URL before any request can send credentials to it.
   The configured session origin is trusted; any additional API or blob origin
   must be listed explicitly.
4. Keep test credentials in an ignored `.env.local` file. Send them only in
   server-side HTTP Basic authentication for the smoke test. Never print them,
   response bodies, or mailbox names.
5. Request `Mailbox/get` for the mail primary account. Do not expose this check
   as a public Route Handler before authentication exists.
6. Prefer Stalwart OAuth Authorization Code + PKCE for Phase 1 because the live
   authorization-server metadata advertises `authorization_code` and `S256`.
   Confirm registered-client and callback requirements before implementing that
   flow.

## Dependencies

- Node.js 24.12 or newer and pnpm. Node's stable TypeScript type stripping runs
  the focused proof-of-concept scripts without adding a TypeScript runtime.
- Next.js App Router, React, and TypeScript.
- A dedicated Stalwart test account for authenticated verification, configured
  locally in `.env.local`.

## Security considerations

- No credentials, access tokens, or mailbox data are added to browser code,
  browser storage, client cookies, or public API responses.
- Fetch redirects are handled manually. Session redirects and advertised URLs
  must resolve to trusted origins before credentials are sent.
- JMAP response bodies are not emitted to logs. Smoke output includes only a
  mailbox count and roles.
- No account registration, mail mutation, or server configuration change is
  performed.
- Plain HTTP is rejected for public hosts, even when the private-network option
  is enabled.

## Risks and open items

- The public endpoint is reachable from this workstation, but the application
  host's private-network route to Stalwart has not been inspected. No
  infrastructure changes are in scope.
- Unauthenticated discovery returns an empty `accounts` map. Authenticated
  `Mailbox/get` has since been verified with the dedicated test account.
- OAuth metadata advertises Authorization Code + PKCE, but client registration
  and allowed callback setup have not been exercised.
- The repository has no Git metadata, so the harness micro-commit rule cannot be
  followed here.

## Execution order

1. Inspect the workspace and current official Next.js, Stalwart, and JMAP docs.
2. Verify public session discovery and OAuth metadata with read-only GETs.
3. Add the minimal Next.js project shell and safe environment template.
4. Implement the local JMAP smoke command and focused tests.
5. Run unit tests, typecheck, production build, and unauthenticated discovery.
6. Run authenticated `Mailbox/get` when a dedicated test account is configured
   (completed successfully; 5 mailboxes returned).
7. Update progress and roadmap based on observed evidence.

## Acceptance criteria

- [x] Repository state and available toolchain are recorded.
- [x] JMAP session discovery succeeds from this workstation.
- [x] Session redirects and advertised endpoints are constrained to configured
      trusted origins.
- [x] Authenticated `Mailbox/get` succeeds for a dedicated test account (5
      mailboxes returned).
- [x] The proof of concept does not expose credentials to the browser or logs.
- [x] OAuth support and the recommended Phase 1 direction are documented.
- [x] No Phase 1 or later product feature is implemented.

## Verification strategy

- Unit tests cover read-only request construction, response mapping, redirect and
  endpoint allowlisting, and private-HTTP restrictions.
- TypeScript checks the Next.js application and JMAP proof-of-concept code.
- A production build validates the minimal App Router shell.
- `pnpm jmap:discover` checks current unauthenticated session discovery.
- `pnpm jmap:smoke` must be run with a dedicated test account and is the only
  evidence that counts for authenticated mailbox access. This check passed and
  returned 5 mailboxes.

## Explicitly excluded

- Login, session storage, or OAuth callback routes.
- Inbox or message UI, message bodies, attachments, sending, and mailbox
  mutations.
- New VM, Docker, DNS, Cloudflare, or Stalwart configuration.
- OAuth client registration or any external configuration mutation.
