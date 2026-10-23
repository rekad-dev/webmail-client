# Roadmap

The work follows the product phases in `PROMPT.md`. Phase 0 is complete; Phase 1
is active and must pass end-to-end authentication before Phase 2 begins. Later
phases remain sequential.

| Phase | Scope | Priority | Status |
| --- | --- | --- | --- |
| 0 | Project discovery and JMAP proof of concept | P0 | Complete: discovery and authenticated `Mailbox/get` verified |
| 1 | Secure authentication using Stalwart OAuth where available | P0 | In progress; production OAuth callback returns HTTP 500 during JWT finalization, so no app session is established |
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
setting changes. Local provider/session/status checks pass. In production, the
user signed in at Stalwart and returned to the registered callback, confirming
the authorization-code exchange and OIDC profile processing completed. The
callback then returned HTTP `500` during Auth.js JWT finalization, and the
browser has no app session. Vercel logs show `CallbackRouteError` and an
underlying `TypeError: immutable`; the current deployed handler does not expose
which finalization stage failed. A reviewed, locally verified diagnostics
change can identify that stage, but needs explicit approval before production
deployment. Do not start Phase 2 until Phase 1 login has been tested
successfully. The missing
`stalwart-webui` registration is a future hardening prerequisite, not an MVP
blocker. Optional `requireClientRegistration` hardening remains separate and
requires the user's explicit approval after a current settings/client review.
