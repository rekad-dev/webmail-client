# Roadmap

The work follows the product phases in `PROMPT.md`. Phase 0 is complete; Phase 1
is active and must pass end-to-end authentication before Phase 2 begins. Later
phases remain sequential.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | Production login, app session, read-only mailbox access, bounded expiry, and normal logout verified; guarded logout failure handling is implemented locally; Phase 1 verification remains |
| 2 | Real inbox and mailbox listing | P0 | Pending |
| 3 | Safe email reading and HTML isolation | P0 | Pending |
| 4 | Compose and send through JMAP | P0 | Pending |
| 5 | Essential mailbox actions, search, threads, and drafts | P1 | Pending |
| 6 | Attachments, responsive UX, and accessibility refinement | P1 | Pending |
| 7 | Limited offline storage and synchronization | P2, optional | Pending |
| 8 | Polling, JMAP events, and optional notifications | P2, optional | Pending |

Phase 4 is the first usable MVP boundary. Phase 1 reuses the existing `webmail`
client and exact callback
`https://webmail.rekad.id/api/auth/callback/stalwart`, with no client or server
setting changes. The production login completed, the app session persisted,
and `/api/auth/status` confirmed read-only OAuth-token `Mailbox/get`. The
session expiry was future-dated and within the eight-hour app cap. Normal
logout cleared the browser session and deleted the app session row, verified
with a read-only database count. Reviewed commit `58f5ccd` fixed Auth.js subject
validation and is deployed as `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY`. Phase 1
remains active for invalid-credential handling, multi-account isolation,
forced refresh behavior, and production verification of the guarded logout
path. The guarded path now revokes the app session before delegating to Auth.js;
it returns `503` without clearing the cookie if database revocation fails. Unit
tests cover that behavior locally. The guarded path is deployed as
`dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS` at `https://webmail.rekad.id`; the normal
production logout check is pending a fresh test-account sign-in. Do not start
Phase 2 automatically. The missing
`stalwart-webui` registration is a future hardening prerequisite, not an MVP
blocker. Optional `requireClientRegistration` hardening remains separate and
requires the user's explicit approval after a current settings/client review.
