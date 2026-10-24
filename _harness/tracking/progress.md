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
  separate per-message controls. Source-level UI review and the approved
  production rendering review are recorded.
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
  change was restored. With the user's approval, production deployment
  `dpl_4Qec3Yi6Wep7z1DNGvUsjyhTsgLn` is Ready at
  `https://webmail.rekad.id`; Vercel's remote build passed. The approved
  read-only browser review at desktop and 390px phone widths is recorded in
  `phase-5-production-ui-review`; the first Inbox listing rendered without a
  visible error and no horizontal overflow appeared on phone. No message was
  opened and no mailbox action was taken. A separately approved `Test` search
  in All mail returned two conversation summaries; neither displayed subject
  was exactly `Test`. The check is recorded in
  `phase-5-production-search-check`; thread members were not opened, so exact
  target-message membership remains unconfirmed. Further search cases, thread
  details, action persistence, and draft persistence need separate approval.
  The independent final code review found no actionable issues; its artifact is
  `phase-5-hardening-parser-rereview-2026-10-24`. The implementation is in
  commits `1e8dc87` and `27f09aa`. Phase 5 remains in progress until remaining
  production verification is explicitly authorized and completed.

- The subject-only thread metadata endpoint was independently reviewed. The
  final P2 finding was fixed by bounding returned member subjects to 512
  characters while retaining raw candidate subjects for exact comparison;
  commit `58219a4` records the fix. `pnpm test` passes 101/101,
  `pnpm typecheck` passes, and `pnpm build` passes. Approved production deploy
  `dpl_8Ztw8rj2rq3p1Nivr3ebDV4NrLrb` is Ready at
  `https://webmail.rekad.id`. The authorized metadata-only lookup for
  `Fwd: Test Send` returned `404 thread_not_found` and no subjects. No body or
  preview was requested, and no mailbox state changed. The later retry using
  the exact stored subject and its diagnosis are recorded below.

- The user then supplied the exact subject `Re: Fwd: Test Send`. The lookup
  diagnostics in commit `92649e1` show `/api/auth/status` passed account access
  and primary-account matching, while the subject-filtered `Email/query`
  returned zero candidates (`subject_query_empty`). No `Email/get` or
  `Thread/get` was issued, so thread membership and message count could not be
  determined. The latest production deployment is
  `dpl_GN1afZYmaZYBGWz81VaB3rh7TykE` at `https://webmail.rekad.id`. The final
  Phase 5 suite passes 109/109, typecheck passes, and build passes. No body,
  preview, or mailbox mutation was involved. On 2026-10-25, the user
  authorized a broader subject-only candidate search. The account check again
  passed. Searching the partial subject `Test Send` produced two JMAP query
  candidates but zero exact subject matches; `Fwd: Test Send` and
  `Re: Test Send` each produced zero candidates. The diagnostic endpoint does
  not expose candidate subjects when no exact match resolves a thread, so no
  thread lookup occurred and message count/member subjects remain unavailable.
  This points to subject matching/value differences rather than account scope;
  thread identification was not reached. No body or preview was fetched and no
  mailbox state changed. Full record: `phase-5-production-search-check`.

- The bounded subject-candidate metadata endpoint is committed as `095bfc4`.
  It exposes candidate/member subjects and thread counts without bodies or
  previews, caps JMAP fanout, applies an 8-second operation deadline, and marks
  stale or timed-out lookups incomplete. The final independent review found no
  actionable issues. Local verification passed: 118/118 tests,
  `pnpm typecheck`, `pnpm build`, and `git diff --check`. Production deployment
  `dpl_9nBW19CiNWPoZghFave54kNsy7QD` is Ready and aliased to
  `https://webmail.rekad.id`; Vercel's remote build passed. After approval to
  create a replacement Ego TaskSpace, the first-account `/api/auth/status`
  check returned `authenticated: true` and `mailboxAccess: true`. The
  subject-only candidate POST returned `200`, two candidates grouped into one
  thread, and two member messages. Candidate subjects were `Re: Fwd: Test Send`
  and `Fwd: Test Send`; member subjects were `Fwd: Test Send` and
  `Re: Fwd: Test Send`. The exact subject supplied by the user was present.
  Candidate/thread disappearance counts were zero; member lookup and overall
  results were complete, with no truncation. No message body or preview was
  fetched, no Inbox listing was opened, and no mailbox state changed. Full
  record: `phase-5-production-search-check`.

- The temporary no-recipient JMAP draft survived a page reload and reopened
  with the exact saved subject/body and empty recipient fields, then was moved
  to Trash successfully. The live draft check is recorded in
  `phase-5-draft-persistence-check`; no message was sent or permanently
  deleted. A separately approved flag check on that exact draft returned JMAP
  HTTP 200 for mark-unread/read and star/unstar, restoring its original
  read/unstarred defaults. No body or preview was requested. The check is in
  `phase-5-state-actions-check`. A separately approved `move` test moved the
  same draft from Trash to Drafts and back; both transitions returned
  JMAP-confirmed success and listings confirmed its location after each step.
  The test is recorded in `phase-5-move-action-check`; the test draft remains
  in Trash. Remaining live acceptance checks are move/archive/trash on a
  regular message and reply/forward prefill. The project safety rules require
  explicit approval before further production mailbox mutations or opening
  messages that may load content or alter read state. Keep Phase 5
  `in_progress`; do not start Phase 6.

- A separately approved read/star check on the regular message with exact
  subject `Re: Fwd: Test Send` did not reach any action: the exact-subject
  metadata route returned 404 and no unique member ID. Authentication passed;
  no mailbox state changed. The broader candidate route had already returned
  this subject, but it does not expose IDs. After the user approved the
  preview-bearing fallback, `/api/mail?q=Test Send` resolved one matching
  thread and `/api/mail/thread` resolved the exact member. The original flags
  were read and unstarred. JMAP confirmed `mark_unread`, `mark_read`, `star`,
  and `unstar`; final readback confirmed the original flags were restored.
  Preview fields were ignored, no body was requested, and no other message was
  touched. Full result: `phase-5-regular-message-flags-check`.

- The user authorized an archive check using only the temporary no-recipient
  draft `[rekad Phase 5 draft persistence check]`. The first account's
  read-only role scan found Inbox and Trash, with no Archive role. The exact
  draft was already in Trash, so archive was skipped and no mailbox action was
  submitted. The draft remains in Trash. No body or other message was
  inspected. Full result: `phase-5-archive-action-check`.

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

Continue Phase 5 verification only; do not start Phase 6. For
`Re: Fwd: Test Send`, the authenticated JMAP account check passed but the
subject query returned no candidates, so thread identification was not reached.
Further lookup requires another exact subject or separate approval for a
broader subject-only candidate search. Do not load message bodies or mutate
production mailboxes without separate explicit authorization. Keep Stalwart's
global OAuth and registration settings unchanged.
