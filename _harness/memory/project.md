---
role: agent-memory
scope: project
---

# Project Memory

Store only settled decisions and lessons that are not already explicit in PROMPT.md or source code. The product brief remains authoritative for feature scope and acceptance criteria.

## Settled project boundaries

- The product is a webmail client for existing Stalwart accounts, not a mail server.
- Stalwart owns accounts, mailboxes, message storage, and submission. Mailjet remains the existing outbound relay.
- The intended request path is browser → Next.js backend-for-frontend → authenticated JMAP service → Stalwart.
- Use JMAP over HTTP rather than implementing IMAP or SMTP in the application.
- No public account registration is planned.
- The product roadmap is sequential. Phase 0 must establish a real read-only JMAP proof of concept before building a full inbox UI; every later phase is separately reviewed before continuing.
- Offline storage and push/background notification infrastructure are optional follow-up work, not part of the initial MVP.

