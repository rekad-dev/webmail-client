# Project Orientation

## Product

This is a lightweight webmail client for users who already have Stalwart accounts. Stalwart remains responsible for identities, mailboxes, message storage, and submission. The application provides the user interface and a secure server-side integration layer.

The detailed product brief, roadmap, architecture, acceptance criteria, and security requirements live in PROMPT.md. Treat that file as authoritative and read only the relevant phase for each task.

## Proposed architecture

Browser UI → Next.js backend-for-frontend → authenticated JMAP service layer → Stalwart.

The server owns credentials, sessions, authorization, validation, trusted endpoint checks, and JMAP translation. The browser never receives Stalwart credentials or privileged tokens. Use JMAP over HTTP; do not add a separate IMAP or SMTP client.

## Current state

Phase 0 has a minimal Next.js App Router foundation and a local, read-only JMAP proof of concept. Session discovery is verified against the public mail hostname. Authenticated `Mailbox/get` still requires a dedicated test account configured locally in `.env.local`. The current source map is in `_harness/catalog.md`.

## Core references

| Need | Source |
|---|---|
| Product goal, phases, acceptance criteria, security | PROMPT.md |
| Task routing | _harness/routing.md |
| Boundaries and confirmation rules | _harness/rules.md |
| Work procedures | _harness/workflow.md |
| Current source tree | _harness/catalog.md |
| Settled project decisions | _harness/memory/project.md |
| Phase status | _harness/tracking/feature_list.json |
| Current handoff | _harness/tracking/session-handoff.md |
