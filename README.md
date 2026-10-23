# rekad Mail

A lightweight webmail client for the existing Stalwart server. Stalwart remains
responsible for accounts, message storage, and sending; this repository builds
the client and its server-side JMAP boundary.

## Current milestone

Phase 0 establishes the Next.js App Router foundation and a local JMAP proof of
concept. The page is intentionally a placeholder: no inbox or message data is
loaded in the browser yet.

## Requirements

- Node.js 24.12 or newer
- pnpm 10 or newer

## Local setup

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

The development page is available at `http://localhost:3000`.

## JMAP proof of concept

`pnpm jmap:discover` performs read-only session discovery and validates the
advertised JMAP endpoint origins. It does not request mailbox data.

To verify authenticated read-only mailbox access, configure a dedicated
Stalwart test account in `.env.local` using `JMAP_TEST_USERNAME` and
`JMAP_TEST_PASSWORD`, then run:

```sh
pnpm jmap:smoke
```

The command issues only `Mailbox/get`. It reports a mailbox count and roles, and
does not print credentials, mailbox names, or raw server responses. Do not use a
production mailbox for the smoke check.

Set `STALWART_JMAP_SESSION_URL` to the JMAP discovery URL reachable from the
application host. Add any intentionally separate API or blob endpoint origins
to `STALWART_JMAP_TRUSTED_ORIGINS`. HTTPS is required by default. Enable
`STALWART_JMAP_ALLOW_INSECURE_HTTP=true` only for a private network endpoint
that is explicitly trusted.

Keep `.env.local` private. Never rename these settings with a `NEXT_PUBLIC_`
prefix or commit credentials.

## Development checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

See [the architecture](docs/architecture.md), [the roadmap](docs/roadmap.md),
and [the Phase 0 plan](docs/phase-0-plan.md) for the current design and scope.
