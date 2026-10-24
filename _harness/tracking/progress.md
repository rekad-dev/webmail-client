---
role: agent-tracking
scope: progress
---

# Progress

## Phase 5 essential mailbox actions, search, threads, and drafts in progress

- The plan is recorded in the Traycer artifact
  `phase-5-mailbox-actions-search-threads-drafts-plan`.
- The user selected all-mail search with an optional mailbox scope, grouped
  JMAP threads, JMAP Drafts autosave, and thread-wide conversation actions with
  separate per-message controls. The source-level UI review is recorded;
  rendered review awaits browser approval.
- Implementation will use only each authenticated user's OAuth-backed JMAP
  account. The admin API key and Stalwart server-wide settings are out of scope.
- Do not run live production mailbox mutations without separate explicit
  approval. Phase 6 remains pending.
- The working tree now includes server-side all-mail/current-mailbox search,
  collapsed thread listing and bounded conversation reads, account-scoped
  per-message and thread mailbox actions, reply/forward prefills, and JMAP
  Drafts autosave/revision handling. Saved drafts use new immutable JMAP Email
  revisions; sending submits the saved ID through the existing attempt flow.
- Review hardening coordinates draft sends and autosave with an attempt-specific
  JMAP keyword and conditional state updates. Thread summaries aggregate unread
  and starred state across members, bound membership per thread, respect
  `maxObjectsInGet`, and skip aggregation in count-only smoke checks.
- Local Phase 5 verification passes: `pnpm test` (87/87), `pnpm typecheck`,
  `pnpm build`, and `git diff --check`. Test fixtures now cover the default
  `$seen` draft keyword and thread-wide unread/star aggregation; commit
  `413ad2c` records those updates. The build's generated `next-env.d.ts`
  change was restored. No live JMAP/mailbox checks or deployment were run.
  An approved read-only production browser check still showed the pre-Phase 5
  UI; rendered phone/contrast review remains pending a Phase 5 deployment. No
  Phase 5 mailbox mutations were performed. The independent final code review
  found no actionable issues; its artifact is
  `phase-5-hardening-parser-rereview-2026-10-24`. The implementation is in
  commits `1e8dc87` and `27f09aa`. Phase 5 remains in progress until remaining
  production verification is explicitly authorized and completed.

## Phase 4 compose and send complete

- The technical plan is recorded in the Traycer artifact
  `phase-4-compose-send-plan`. The user selected durable Postgres send-attempt
  metadata so duplicate requests can be reconciled; unknown submission results
  must never trigger automatic resend.
- Local implementation is committed in `fd9df24`, `931496a`, `a42cc2a`, and
  `524f880`. It adds a read-only OAuth identity/capability route, validated
  plain-text compose and send routes, attempt metadata schema/store, safe
  JMAP draft submission and Sent reconciliation, and an accessible compose
  dialog. No SMTP client, rich HTML, attachments, or server-wide Stalwart
  settings are included.
- `pnpm test` passes 87/87, `pnpm typecheck` passes, and `pnpm build` passes.
  The independent review artifact
  `phase-4-compose-ui-review` recorded three UI findings; all three are fixed
  and rechecked. Build output's generated `next-env.d.ts` change was restored.
- With the user's approval, `pnpm db:migrate` applied the additive attempt
  table migration, and Vercel production deployment
  `dpl_5xekSb6sLYAwedgKp22aczkXeeBx` reached Ready and aliased
  `https://webmail.rekad.id`.
- The read-only OAuth preflight passed in ego-browser for the first dedicated
  test account. `/api/mail/identities` reported JMAP submission available,
  Drafts and Sent roles present, and one non-wildcard identity
  (`mail-client@rekad.id`). The payload has no explicit default flag; compose
  auto-selects the sole identity.
- On 2026-10-24, the user approved `carleanoravel@gmail.com` for live
  verification. One plain-text message was sent from `mail-client@rekad.id`
  with Cc/Bcc empty. The app reported successful JMAP submission, its matching
  message appeared in Sent Items, and the recipient's signed-in Gmail Inbox
  showed the matching unread message. No other recipient was used.
- No Stalwart settings changed and the admin API key was not used. Phase 4 is
  complete; Phase 5 has not started.

## Phase 3 safe email reading complete

- The plan is recorded in the Traycer artifact
  `phase-3-safe-reading-plan`. Local implementation includes an authenticated
  JMAP detail route, bounded body values and response size, strict server-side
  HTML sanitization, isolated rendering, attachment metadata, and a separate
  same-origin update that changes only `$seen` after the message body loads.
- `pnpm test`: 63/63 passed. `pnpm typecheck` and `pnpm build` passed.
- The independent review's findings are fixed: localhost port trust is exact,
  focus moves into message detail and returns to the triggering row, and a
  pending read-state update reconciles the listing or refreshes it on failure.
- The final production deployment is Ready as `dpl_CuiyH16U1BCwhx6rH9V9bLGEjpRJ`
  and aliased to `https://webmail.rekad.id`. On the signed-in first dedicated
  test account, the authorized unread “Test” message opened; sender/recipient
  metadata and both body formats rendered, and the Inbox unread count changed
  from 3 to 2 with no error. The HTML frame had an empty sandbox and restrictive
  CSP, and the sanitized content contained no scripts, resource elements,
  event-handler attributes, or network URL attributes. Reopening the now-read
  message on the final deployment verified focus on the heading and restoration
  to the Inbox row; the unread count remained 2. No email was sent or deleted.
- The local password-based `pnpm jmap:smoke` context still reports five
  mailboxes and zero Inbox messages, while the production OAuth session listed
  nine. Keep those observations distinct; the production session provided the
  live Phase 3 verification. No Stalwart client or global setting changed, and
  the admin API key was not used.
- The first browser pass exposed a focus-restoration bug because the trigger row
  was unmounted. Commit `edc443c` fixes this by locating the remounted row by
  message ID; deployment `dpl_CuiyH16U1BCwhx6rH9V9bLGEjpRJ` includes the fix.
  Phase 3 is complete. Stop here before Phase 4.

## Phase 2 inbox and mailbox listing complete

- Phase 1 authentication is complete, including production account isolation
  and natural-expiry refresh verification.
- The Phase 2 plan is recorded in the Traycer artifact
  `phase-2-inbox-listing-plan`.
- Scope is read-only mailbox navigation and paginated message summaries with
  plaintext preview, loading/empty/error states, and manual refresh. Message
  detail, mutations, search, and attachments remain out of scope.
- The local implementation passes 45 tests, `pnpm typecheck`, `pnpm build`, and
  an unauthenticated `/api/mail` check (`401 sign_in_required`, `no-store`, and
  `Vary: Cookie`).
- The dedicated-account `pnpm jmap:smoke` passed with five mailboxes and an
  empty inbox (0 IDs and 0 summaries). Output contained counts only. No mailbox
  data was mutated and no Stalwart setting changed.
- Production deployment `dpl_DbN32jRh6FHVYRmV83AWC9JP1uBj` is Ready at
  `https://webmail.rekad.id`. The signed-in test account showed five mailboxes
  and a real empty Inbox. Selecting Drafts, returning to Inbox, and refreshing
  worked; refresh issued a new `/api/mail` request. The empty Inbox correctly
  disabled previous/next controls. No message was opened, sent, or changed.
- Live message-row display and page turns remain unexercised because the test
  Inbox has no messages. JMAP summary mapping, route pagination input, and the
  max page-position boundary are covered by tests. Phase 3 subsequently began
  and is now complete.

## Completed Phase 1 authentication

- Auth.js OIDC login is implemented for the existing Stalwart client `webmail`.
- The home page now has a server-side “Sign in with Stalwart” action and shows
  a signed-in state after the OAuth callback; mailbox listing is Phase 2.
- The callback is the registered exact URI
  `https://webmail.rekad.id/api/auth/callback/stalwart`.
- The callback requires PKCE, state, and nonce checks, validates the OIDC
  subject, and performs OAuth-token JMAP `Mailbox/get` before creating a
  session.
- PostgreSQL stores a hash of each opaque app-session identifier and AES-GCM
  encrypted access/refresh tokens. The browser session cookie is Auth.js's
  encrypted JWE cookie; no Stalwart token is returned to client JavaScript.
- Refresh failures preserve a session for retry except explicit
  `invalid_grant`; client credentials use OAuth form encoding before Basic
  encoding. Expired rows are swept during sign-in and session checks, with no
  scheduled cleanup runner configured.
- The Auth.js sign-out POST now checks the trusted app origin and revokes the
  server-side session before delegating to Auth.js to clear the cookie. A
  session-ID lookup or database failure returns `503` without invoking Auth.js;
  cross-origin requests return `403`. Local tests cover ordering and failure
  behavior. The guarded logout code was deployed as
  `dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS`. The current production deployment,
  including the home-page sign-in action, is
  `dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. On
  2026-10-24, the signed-in production session and OAuth-backed mailbox access
  were confirmed; after the CSRF-protected same-origin Auth.js sign-out POST,
  `/api/auth/session` returned `null` and `/api/auth/status` returned `401`.
  The built-in Auth.js confirmation form POST had `Origin: null` in ego-browser
  and received `403` without changing the session; the standard client flow
  from the app origin passed with the origin guard intact. No production
  database outage was simulated.
- Added an accessible signed-in “Sign out” control using Auth.js `signOut`,
  with pending and retry-error states. Commit `c9d8511` passed all 22 tests,
  `pnpm typecheck`, and `pnpm build`, then deployed as
  `dpl_5JWtuf37v19z7CAiUoUSr38nkgar`. The anonymous home page returned `200`
  with the sign-in button; after logout, `/api/auth/session` returned `null`
  and `/api/auth/status` returned `401`. On 2026-10-24, the user signed in
  again and clicked the deployed sign-out button. The active session had
  mailbox access before the click; afterward the app returned to the sign-in
  page, `/api/auth/session` was `null`, `/api/auth/status` was `401`, and no
  error message appeared. The browser was left signed out.
- Production account isolation passed on 2026-10-24 in the shared browser. The
  second dedicated test account had a populated `/api/auth/session`, and
  `/api/auth/status` returned `200` with `authenticated: true` and
  `mailboxAccess: true`. Signing out the second account returned the session
  endpoint to `null` and status to `401`. The configured first dedicated test
  account then signed in successfully; the two session email identities
  differed, and the first account's status returned `200` with mailbox access.
  The browser is signed in as the first test account. No message data was read
  or mailbox state changed. A parsing mistake caused one rejected credential
  attempt before the corrected login; Stalwart showed its generic invalid
  username-or-password message, and the rejected attempt created no app session.
- Production natural-expiry refresh verification passed on 2026-10-24. The
  prior access-token expiry was in the ~03:53 UTC window; after that window,
  read-only session metadata showed the active token expiring at 04:53:10 UTC
  with a refresh token present. `/api/auth/session` returned HTTP `200` with an
  unexpired app session, and `/api/auth/status` returned HTTP `200` with
  `authenticated: true` and `mailboxAccess: true`. No token or database state
  was changed to force refresh; no mailbox contents were read.
- Deleted the accidental Vercel project `rekad/mail-client`. The requested
  `mail-client-nine.vercel.app` alias and its generated project alias are now
  absent; `rekad/webmail-client` and `webmail.rekad.id` remain.
- Local route checks passed: provider discovery reports `stalwart` and the
  expected callback shape; the empty session is `null`; unauthenticated status
  is `401`.
- `AUTH_STALWART_ID`, the existing client's secret and token-auth method, and
  `DATABASE_URL` are now configured locally. The ID matches `webmail`; the
  idempotent migration created the application session table and expiry index.
- Current local verification: all 24 unit tests, `pnpm typecheck`, and the
  latest `pnpm build` passed.
  The reviewed diagnostics and OIDC subject fix are deployed to
  Vercel production as `dpl_D8oi6i3YB1iwfvF1bUcXBbb7eYaY` at
  `https://webmail.rekad.id`.
- Production callback diagnostics identified the `validate_oauth_response`
  failure: Auth.js assigns `user.id` a random app ID, while
  `account.providerAccountId` is the OIDC subject. Reviewed commit `58f5ccd`
  removed the invalid equality check.
- End-to-end production verification passed: Auth.js returned to the app,
  `/api/auth/session` returned an active session, and `/api/auth/status`
  returned `200` with `authenticated: true` and `mailboxAccess: true`. This
  status check performs OAuth-token `Mailbox/get` and returns only booleans.
- Session expiry was future-dated and within the eight-hour app limit. A
  read-only production DB aggregate found one recent active session before
  logout. Auth.js sign-out then returned the browser to anonymous state
  (`/api/auth/session` `200`, `/api/auth/status` `401`) and the same aggregate
  showed zero recent session rows afterward.
- No mailbox content was returned, no message or mailbox was mutated, and no
  Stalwart client or global registration setting was changed. The admin key
  was not used for application authentication or mailbox access.
- Phase 1 is complete. Production login, mailbox access, bounded expiry,
  invalid-credential rejection, account isolation, guarded logout, and
  natural-expiry refresh passed. Local tests cover sanitized JMAP HTTP 503 and
  network-failure errors; a production outage was not simulated. Phase 2 is
  complete.
- No Stalwart client or server-wide setting has been changed. Keep
  `requireClientRegistration` and `anonymousClientRegistration` unchanged.
  `stalwart-webui` registration remains a future hardening prerequisite, not
  an MVP blocker.

## Next

Phase 5 implementation and code review are complete. Continue with Phase 5
verification only; do not start Phase 6. Do not deploy or mutate production
mailboxes without explicit authorization. Keep Stalwart's global OAuth and
registration settings unchanged.
