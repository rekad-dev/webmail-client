# Roadmap

The work follows the product phases in `PROMPT.md`. Phases 0 and 1 are complete;
Phase 2 is complete. Later phases remain sequential.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | Complete: production login, account isolation, natural-expiry refresh, and guarded logout verified |
| 2 | Real inbox and mailbox listing | P0 | Complete: deployed and checked with a signed-in test account |
| 3 | Safe email reading and HTML isolation | P0 | In progress: local implementation, review fixes, and checks pass; live message verification pending |
| 4 | Compose and send through JMAP | P0 | Pending |
| 5 | Essential mailbox actions, search, threads, and drafts | P1 | Pending |
| 6 | Attachments, responsive UX, and accessibility refinement | P1 | Pending |
| 7 | Limited offline storage and synchronization | P2, optional | Pending |
| 8 | Polling, JMAP events, and optional notifications | P2, optional | Pending |

Phase 4 is the first usable MVP boundary. Phase 1 reused the existing `webmail`
client and exact callback
`https://webmail.rekad.id/api/auth/callback/stalwart`, with no client or server
setting changes. Production login, bounded sessions, account isolation,
natural-expiry refresh, and guarded logout passed. The current Phase 2 work is
limited to authenticated, read-only mailbox navigation, paginated message
metadata, and manual refresh. Automated checks and the dedicated account's
read-only JMAP smoke pass; production browser verification confirmed five
mailboxes, the empty Inbox state, mailbox selection, return to Inbox, and
refresh. Live row display and page turns remain unexercised because the account
has no Inbox messages. Its plan excludes message bodies and mailbox mutations.
The missing
`stalwart-webui` registration remains a future hardening prerequisite, not an
MVP blocker. Optional
`requireClientRegistration` hardening remains separate and requires the user's
explicit approval after a current settings/client review.
