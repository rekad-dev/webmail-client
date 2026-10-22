# Roadmap

The work follows the product phases in `PROMPT.md`. Phase 0 is complete; Phase 1
is next and remains gated on user direction. Later phases remain sequential.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | Plan drafted; implementation pending |
| 2 | Real inbox and mailbox listing | P0 | Pending |
| 3 | Safe email reading and HTML isolation | P0 | Pending |
| 4 | Compose and send through JMAP | P0 | Pending |
| 5 | Essential mailbox actions, search, threads, and drafts | P1 | Pending |
| 6 | Attachments, responsive UX, and accessibility refinement | P1 | Pending |
| 7 | Limited offline storage and synchronization | P2, optional | Pending |
| 8 | Polling, JMAP events, and optional notifications | P2, optional | Pending |

Phase 4 is the first usable MVP boundary. Phase 1 is the next phase and its
OAuth plan is drafted. An unfiltered read-only OAuth client query returned one
preexisting `webmail` client, but the current key cannot read global provider
settings and includes unnecessary client-create/update permissions. Complete
the provider-settings audit and resolve that client's ownership and callback
before registration or implementation.
Optional `requireClientRegistration`
hardening is separate from the working authentication flow and requires the
user's explicit approval after the current policy and client inventory are
reviewed. Phase 5 and later work must not begin until the preceding phase is
completed and reviewed.
