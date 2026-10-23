# Roadmap

The work follows the product phases in `PROMPT.md`. Phase 0 is complete; Phase 1
is active and must pass end-to-end authentication before Phase 2 begins. Later
phases remain sequential.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | Implementation in progress; production host responds, but provider sign-in returns HTTP 500 before OAuth starts |
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
setting changes. The local environment and session schema are configured, and
local provider/session/status route checks pass. Production providers, session,
CSRF, generic sign-in, and Stalwart OIDC discovery checks now respond
successfully; unauthenticated status returns `401`. The provider-specific
sign-in route returns an empty `500` before redirecting to Stalwart. The
hostname resolves, but the Vercel CLI cannot map it to a project in its active
scope, so the function error log is not available yet. Do not start Phase 2
until Phase 1 login has been tested successfully. The missing
`stalwart-webui` registration is a future hardening prerequisite, not an MVP
blocker. Optional `requireClientRegistration` hardening remains separate and
requires the user's explicit approval after a current settings/client review.
