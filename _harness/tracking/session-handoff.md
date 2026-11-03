---
role: agent-tracking
scope: session-handoff
---

# Session Handoff

## 2026-11-03 footer before quoted reply history

New replies now assemble as header, authored reply, footer, then reply
attribution and quoted history outside the closed branded frame. The app
marks its generated reply blockquote; Tiptap preserves that marker while
editing, and the draft sanitizer allows only its exact `true` value.
`lib/mail/message-layout.mts` provides one layout function for preview and
outgoing HTML. Plain text follows the same order. Banner version is now 4.
Ordinary authored quotes, forwards, and older unmarked reply drafts retain
their existing layout; no heuristic guesses which unmarked text is history.

Typecheck, 285 tests, and local sample browser checks passed. The browser
confirmed attribution is marked, preview history is outside/after the frame,
footer precedes history, and the marker survives minimizing/restoring.
Regression tests cover HTML/plain text order, nested quotes, draft banner
stripping/rebuilding without duplication, ordinary quotes and invalid/nested
markers. The design detector reported no findings. No real mailbox was
accessed or message sent.

Local production build passed. Code commit `4b22868` is NOT deployed:
`vercel deploy --prod --yes` from the clean release archive at
`/tmp/rekad-reply-layout-release.Loa0p9` returned `Not authorized` for the
existing `rekad/webmail-client` project on 2026-11-03. Restore access before
retrying; no alternate account, token, or project was attempted.

## 2026-10-30 optional hyperlink display text

The link editor now includes Display text (optional). Opening it preloads the
selected text or the full existing link text. Custom text replaces that range
with a safely encoded link while preserving inline marks at its start. If
blank, selected/existing text stays unchanged; with no selection, the URL is
inserted. Link address and display text have separate labeled inputs.

Typecheck and 282 tests passed. Local sample browser checks confirmed custom
text (including literal HTML characters), editing and prefilling an existing
label, blank-field fallback for selected text and an empty cursor, Enter from
both inputs, and zero enclosing-form submit events. Desktop and 390px layouts
were inspected; phone input/application worked without document horizontal
overflow. The existing phone footer can overlap editor content until scrolled.
No real mail was accessed or sent. The design detector returned no findings
for the changed editor component.

Code commit `5abc116` is ready but NOT deployed. A clean archive at
`/tmp/rekad-link-label-release.bMmhNO` was linked to the existing
`rekad/webmail-client` project; `vercel deploy --prod --yes` returned
`Not authorized`. `vercel whoami` returned `dev-31894631`. Local production
build passed afterward. Restore access to that existing project, then retry
this exact release; do not change account, token, or project as a workaround.

## 2026-10-30 composer link control

The rich-text link editor was a nested form inside the compose form; applying
a link could bubble a submit event to Send. It is now a labeled group with
button actions and scoped Enter/Escape handling. Applying a URL with an empty
selection inserts visible linked URL text; selected text and existing links
are still updated in place. Invalid schemes remain rejected, errors are
associated with the input, and controls respect disabled state.

Local sample browser checks confirmed selected-text linking, changing an
existing URL, removal while retaining text, empty-cursor insertion, mailto,
invalid-scheme rejection, Enter to apply, Escape and keyboard Cancel. The
compose form received zero submit events throughout. Preview HTML retained
the anchor. A direct content-preparation check confirmed the link survives in
outgoing HTML and plain text. Typecheck and 282 tests passed; the design
detector returned no findings. No real message was sent or mailbox accessed.

Deployed commit `511373d` from a clean archive to `webmail.rekad.id` as
`dpl_3Et2CbW9EohJyoVYcg5uLFAmU1MJ` (READY). Vercel production build passed;
anonymous HTTP checks returned home 200 and identities 401. The link flow was
verified in the local sample, not against an authenticated production mailbox.

## 2026-10-30 compose expanded/minimized controls

Compose now has two window states: expanded on first open, and minimized.
The control next to Close shows Minimize immediately and switches to Expand
when minimized. The sidebar button always says Compose; it is disabled while
the composer is expanded and restores the existing mounted composer when
minimized, preserving its fields and draft state.

Validation: typecheck and all 282 tests passed. In the development-only sample
inbox, checked initial Minimize, disabled/enabled Compose states, pointer cursor,
keyboard Enter on Compose to expand, and expansion through the header control.
Recipient, subject and body survived minimizing/restoring; desktop and 390px
checks showed no document horizontal overflow. No real mailbox was accessed.
Impeccable's detector returned no findings for the two changed files.

Deployed commit `201c435` from a clean Git archive to `webmail.rekad.id`.
Vercel deployment `dpl_6CGVqAV36xSSTwP3rpjZ61MRgVrJ` is READY; the
production build passed. Anonymous HTTP checks: home 200, settings 307 to
home, linked accounts 401. No signed-in production compose check was run.

## 2026-10-29 sliding sessions and signing in again to a logged-out account (deployed)

Commit `bb729c0` was deployed from a clean Git archive to the existing
`rekad/webmail-client` project. Vercel deployment
`dpl_94jGjfRHJHhBBpsQdSGDkPEXa9nu` is READY and aliased to
`https://webmail.rekad.id` (deployment URL:
`https://webmail-client-nmyx0i1sw-rekad.vercel.app`). All 282 tests and
typecheck passed again; the production build passed on Vercel. Anonymous HTTP
checks: `/` 200, `/settings` 307 to `/`, `/api/auth/status` 401, and
`/api/account/linked` 401. No signed-in browser checks or mailbox operations
were performed. Real login prefill and rolling renewal remain unverified.
Untracked `reference.png` was excluded from the release.

Sessions now idle out after 7 days of non-use; `getAuthenticatedOAuthSession`
(any mailbox call, and the 2-minute `/api/auth/status` poll) pushes `expires_at`
back to 7 days from now, at most hourly, and never past 30 days from
`created_at` (`lib/auth/session-policy.mts`). Sessions without a refresh token
do not slide. `/api/auth/status` re-sends the browser's session cookie with a
fresh Max-Age. The Auth.js JWT and cookie lifetime is now 30 days (the database
row is what ends a session earlier), so only sessions created after this ships
get the longer window; existing ones end at their original 7 days.

A "Logged out" row in the account switcher is now a button: it posts
`/api/account/add` with its handle (keeping the other logged-out marks), then
starts the Stalwart sign-in with `prompt=login` and `login_hint=<label>`.
Stalwart's `/login` page script reads `login_hint` into its username field
(read from the page source; not exercised in a browser). Once the person signs
in, the old mark is removed by label on the next full account list. If the
label (JMAP username) differs from what Stalwart accepts as a username, the
field will not be prefilled correctly.

## 2026-10-29 background sending and colleague pictures (deployed)

Send is asynchronous. The composer saves the draft, then hands the exact
`/api/mail/send` request to `components/mail/background-send.ts` and closes; the
inbox opens. A sonner toast ("Sending message…" then "Message sent" or "Message
not sent") reports the outcome. "Sent" means Stalwart accepted the submission,
not that the recipient server received it. Unclear results (network loss,
`unknown`, `in_progress`) are rechecked up to three times with the same attempt
key, which the server treats as a status check; after that a persistent warning
says to check Sent. The draft is saved before sending and only moves to Sent
once Stalwart accepts, so every failure leaves it in Drafts ("Open draft" action
on the toast). A leave-page warning shows while a send is in flight. Not done,
by the user's choice: SMTP/Mailjet delivery tracking (header correlation and
webhooks) is deferred.

Pictures: migration `0005-profile-picture-email.sql` adds an `email` column to
`app_profile_pictures` (additive; set on upload from the verified sign-in, and
backfilled when the owner next opens the home page). Signed-in users can ask
`GET /api/profile/pictures?address=…` (max 50) which addresses have a picture
and fetch `GET /api/profile/picture?address=…&v=<version>`; a URL whose version
matches is cached privately for a day, otherwise `no-cache` with an ETag. Message
detail and thread senders use `SenderAvatar`; the account switcher uses the
picture address and version that `/api/account/linked` now returns. Pictures
only match the address in the sign-in's email claim, not aliases. The migration
was run on the production database (verified: `email` column exists) with the
user's approval, then the code was deployed as `webmail-client-1t8vcdmqv`
(Ready, aliased to webmail.rekad.id; home 200, `/settings` redirects, picture
routes 401 anonymously). Checked only in a local preview: the toast position
(desktop). Not checked against a real account: a real send, the toasts after
it, and colleague pictures.

## 2026-10-29 quote formatting and account switcher

Compose preview now styles blockquotes, and outgoing managed message HTML adds
trusted inline quote styling after sanitization so recipients' mail clients can
display it. The account switcher no longer shows the background "Updating…"
hint. Typecheck, build, and 263 tests passed. No browser or real-mail check was
performed. These changes are local, not deployed.

Still requested: return to the inbox immediately after send, continue sending
asynchronously, and surface reliable success/failure in a toast; correlate
Stalwart and Mailjet delivery events and retain drafts until the agreed success
point. Existing behavior saves first and moves the draft to Sent when Stalwart
accepts submission, retaining it on rejection or uncertainty. Mailjet's sent
event means the destination SMTP server accepted the message, not that a human
read it. Internal sender avatars and other linked-account avatars also remain
unimplemented: pictures are currently private and keyed by OAuth subject, and
there is no authorized address-to-subject directory. Preserve account isolation
and avoid exposing credentials or private pictures when designing that flow.

## 2026-10-29 compose toggle, logged-out accounts, optimistic refresh (deploying)

The compose header has one toggle: it expands a normal or minimized window and
minimizes an expanded one. Linked-account cookie records now carry each
account's handle and label (`token|handle|base64url(label)`), so an account
whose session has ended stays in the switcher as "Logged out" instead of being
dropped. Logged-out accounts cannot be switched to, and adding an account
clears them to make room. The switcher stays usable while it refreshes, and a
switch shows "Opening…" on its row at once. Refresh shows its loading state on
click, and the hover actions in inbox rows no longer fade behind the date.
Checked: typecheck, 263 tests (new linked-account tests included), build, and
the compose toggle in the local preview. Not checked against a real account:
the logged-out rows, the switcher, and refresh.

## 2026-10-29 compose discard warning and refresh guard (deploying)

Leaving compose (close, mailbox, Favorites, shared account, Settings) saves
typed changes first. If there is no sender identity or the save fails, a modal
asks whether to keep editing or discard the message. Untouched or erased
messages close without a warning. Refresh and tab close show the browser's own
"Leave site?" prompt when there are edits, because a custom modal cannot run
there. The Tiptap editor no longer emits an update when its editable state
changes, which had made untouched drafts look edited. The editor shows no
purple focus outline. Checked in a scratch copy with stubbed draft routes:
untouched, erased, typed with identity, no sender, keep editing, discard, failed
save, and the refresh guard. Typecheck, 259 tests and build passed. Not checked
against a real account.

## 2026-10-29 settings workspace (deployed)

Commit `a6f93c6` is deployed as `dpl_F9ZCsLwt8mL2k6UHWM5N4WNcBZAk`,
Ready and aliased to `https://webmail.rekad.id`. The production build passed;
anonymous checks returned 200 for home and redirected `/settings` to sign-in.
The earlier local build, typecheck and 254 tests passed, and the sample preview
was checked on desktop and mobile. Authenticated settings actions have not
been checked on production.

## 2026-10-29 account switcher visual correction (deployed)

Commit `3cef79b` fixes account menu styling overridden by Tailwind utilities.
Deployment `dpl_6v9WArnMFQzPKDRfopYHRrRUJxAv` is Ready and aliased to
`https://webmail.rekad.id`; its production build passed and the home page
returned 200. The local build, typecheck and 254 tests passed. An isolated
loopback preview using sample accounts was reviewed in ego-browser on desktop
and at 390 px, with keyboard Escape returning focus to the avatar. No real
account or mailbox was used for the browser review.

## 2026-10-29 account switcher UI (deployed)

Commit `7aa1fb0` is deployed as `dpl_BqTxek1N3q5K39x5CFyt93SW5btE`,
Ready and aliased to `https://webmail.rekad.id`. Vercel's build passed;
anonymous checks returned 200 for the home page and 401 for linked accounts.
The prior local verification passed 254 tests, typecheck and build. The new
popover and authenticated switching have not yet been checked in a browser.

## 2026-10-29 inbox refinements and search (deployed)

Production deployment `dpl_7CcVHGKGpsKBuY64GndtwmGn3fgK` is Ready and
aliased to `https://webmail.rekad.id`, from commit `24623a7` (including
`056428c`). The compose/sidebar and row refinements are live, along with a
larger search field, matching conversation suggestions, tab-local search
history and JMAP filters for attachments, the last seven days and the signed-in
email address. Search is scoped to the selected personal or shared account;
the from-me filter does not include other aliases. The local 254-test suite,
typecheck and production builds passed. Anonymous home returned 200 and a
filtered search returned 401. Browser presentation and authenticated search
behavior have not been checked live; no mailbox data was accessed.

## 2026-10-29 shared group mail and account switching (deployed)

Commit `523bd28`, including shared group mail and account switching, was
deployed from a clean Git export to the existing `rekad/webmail-client` project
as `dpl_DE7Cu8Gw72dqD9UwG6W34CkaSQej`. Vercel reports Ready and the
`https://webmail.rekad.id` alias. The production build, 252 local tests and
typecheck passed; anonymous checks returned 200 for the home page and 401 for
the shared and linked accounts APIs. No migration was required. Live shared
mail and switching with two accounts remain unverified; see the shared group
mail and account switching section below for scope and limitations.

## 2026-10-28 profile pictures (deployed)

Deployed with commit `cb3fdb4` after the user approved running the additive
migration `0004-profile-pictures.sql` on the production application database
(verified: table `app_profile_pictures` exists with 0 rows). People add, replace,
or remove their own picture in the account menu. The browser crops it to a
256x256 WebP/PNG; `/api/profile/picture` (GET/PUT/DELETE, own picture only, keyed
by OAuth subject) validates the file signature, 256 KiB size and 32-512 px
dimensions, and serves it with nosniff and a sandbox CSP. It shows in the
header account button and the sidebar footer. Not built: showing a person's
picture to other users (for example next to their messages); that needs a
decision about visibility. Not verified live: an upload while signed in. The
custom login page is deferred by the user. The live accessibility audit still
needs a fresh test-account sign-in.

## 2026-10-28 offline copies archived, internal-tool sign-in (deployed)

Deployed as `dpl_` at `https://webmail.rekad.id` (aliased; commits up to
`8ea7d15`). Offline copies are off behind `OFFLINE_COPIES_ENABLED` in
`lib/offline/feature.mts`; see `archive/offline-copies/README.md`. The offline
page files moved out of `public/`, and `public/sw.js` is a retirement worker.
Copies already saved in a browser's IndexedDB stay hidden until that browser
signs out, which clears them. New-mail alerts still use the same storage and
were not changed. The sign-in page is a dark single-action card with the
"rekad administrators will never ask for your password" notice; the
authentication-details text is gone. The page does not collect a username or
password, because credentials are entered at mail.rekad.id (OAuth).

## 2026-10-28 compose overflow, auto sign-out, SEO, sign-in copy (deployed with the next entry)

- Compose: the body field grows with its content and the form scrolls; the
  action bar is sticky so Send stays reachable (checked with long text at
  desktop and 390 px in the local preview).
- Auto sign-out: `components/mail/use-session-guard.ts` ends the session on a
  `sign_in_required` result or a 401 from `/api/auth/status` (checked every 2
  minutes and on tab focus or reconnect). It clears offline copies like a
  manual sign-out and is off while the composer is open. Not tested against a
  real expired session.
- SEO: metadata (title, description, canonical, Open Graph, Twitter), JSON-LD
  on the sign-in page, `robots.ts`, `sitemap.ts`, `opengraph-image.png`, app
  icons, noindex on `/message/original` and `offline.html`. Cloudflare serves a
  managed robots.txt block on the live domain; Google also needs the site
  verified and the URL submitted in Search Console, which only the domain
  owner can do.
- Sign-in copy was rewritten with the humanizer skill (installed globally from
  blader/humanizer) and the project antislop filter; the fake mailbox window
  and developer jargon are gone.

## 2026-10-28 fixed email header and footer

Banner customization is disabled: the admin page, `/api/admin/banners`, the
allowlist (`REKAD_BANNER_ADMIN_SUBJECTS`), and the settings store were removed.
`lib/mail/fixed-mail-banners.mts` holds the markup (version 2): a grey page with
a 600 px card, the rekad header at the top of the card, the message, and a
centered grey footer (copyright with the current year, the Apple Developer
Academy @BINUS address, www.rekad.id and @rekad.id links, and a grey Instagram
icon). The header and icon are embedded in each message as `cid:` inline parts
(`multipart/related`), so they show without "load images". Their bytes live in
`lib/mail/fixed-mail-images.mts` (generated from `lib/mail/assets`, with a test
that fails on drift); they are uploaded as JMAP blobs when a draft is created
(cached per account for 5 minutes). Inline `cid` images are hidden from
attachment lists and ignored when reopening drafts. `public/mail-header.png`
is only used for the compose preview. `app_managed_mail_banners` remains in the
database, unused. The Instagram link is inferred from the header image
(`rekad.id`). Not yet verified: a real send through Stalwart and how Gmail and
Apple Mail render it.

## 2026-10-28 shadcn/ui, type scale, link confirmation (deployed)

Deployed as `dpl_G76bj74NQNAVjcrWTt2PiNgdsMsp` at `https://webmail.rekad.id`
(commits up to `595af78`). UI conventions now in force:

- shadcn/ui (new-york, Radix) lives in `components/ui`; mail components are in
  `components/mail`. Use shadcn Button, Input, Select, DropdownMenu, Popover,
  Collapsible, AlertDialog and Checkbox instead of native controls or `<details>`
  menus. `OptionSelect` wraps Select and portals into the nearest dialog.
- `app/styles.css` is the single entry stylesheet: Tailwind theme and utilities
  above the hand-written CSS (`legacy` layer, no preflight, only a border/form
  reset in `base`). The CLI installs a stray `cn` package and `from "cn"`
  imports; both must be replaced with `@/lib/utils`.
- Type scale: 14/15/16/18/22/28 px via `--text-xs..2xl` (also used by `text-*`).
- Message links are real anchors in sanitized HTML; clicks are intercepted in
  `MessageHtmlFrame` and confirmed in `ExternalLinkDialog`.
- The earlier sign-in 500 fix is live. The live-account read-only audit is
  waiting for the user to sign in (task space 65 was handed to the user).

## 2026-10-28 message view rework (local, not deployed)

Commits `2a60a81`..`2af317f`: message view is Gmail-style (sender details open
from the "to …" line, formatted body at natural height, custom kebab menu with
only working actions, "Links in this message" panel removed; body links remain
inert). `/message/original?emailId=` shows parsed headers plus up to 1 MB of raw
source via `/api/mail/original`. The earlier sign-in HTTP 500 was an Auth.js
`InvalidCheck` redirect whose immutable headers were mutated; fixed in
`2af317f`. The live-account audit is still pending a deploy and a fresh
sign-in. Show original has only unit tests; it was not run against a real
mailbox.

## Latest feature: rich-text composition and managed banners

The user approved a rich-text editor for all users and an admin page for
`core@rekad.id` header/footer banners. Admin authorization is an explicit
allowlist of stable OAuth subject IDs (`REKAD_BANNER_ADMIN_SUBJECTS`), and
managed banners apply to all outgoing messages. The implementation is
committed. After the user confirmed the production database target,
`pnpm db:migrate` completed and a read-only query verified singleton row
`id=1`, version `0`, with empty header/footer values. Production subject IDs are
not configured yet; the user requested deployment after providing them. Do
not deploy until then. Do not change Stalwart global settings or use its admin
API. No tests, typecheck, build, browser, mailbox, or deployment operations
were run for this feature.

Rich HTML is sanitized on the server and saved as JMAP HTML with a plain-text
alternative. Compose previews current banners, and send checks the saved draft
against the current banner version. A terminal rejected send attempt is reset
for a safe retry; unknown/in-progress attempts retain their key. The feature
plan is in the Traycer artifact `core-mail-banners-rich-text-plan`.

## Current status

The user explicitly asked to proceed through Phases 6, 7, and 8. Their code
and tests are committed in `8969c27`, `ea5f6ef`, and `c6264b7`. Phase 6 covers
bounded attachment transfers, signed account-bound receipts, attachment-aware
drafts/sending, and compose/detail UI. Phase 7 covers explicit, bounded
IndexedDB mail copies, account-scoped JMAP synchronization, a static offline
shell, and clearing storage before logout. Phase 8 covers active-tab JMAP
change polling, Inbox membership checks, cross-tab deduplication, and generic
opt-in notifications.

Local verification passes: `pnpm test` (185/185), `pnpm typecheck` via the
successful production build, `node --check public/offline.js`,
`node --check public/sw.js`, and `git diff --check`. The Next.js build changed
generated `next-env.d.ts`; that build-only diff was restored. Fresh review
findings about `hasMoreChanges` and bidi attachment names were fixed and
confirmed; see `phase-6-8-review-2026-10-25`.

The current production deployment is `dpl_6tcSUUPDK5stvVwAUeZ5xBDroZZT`,
READY at `https://webmail.rekad.id`; `reference.png` is excluded from deploys.
In the approved Ego TaskSpace 16, the first account loaded the Inbox. Desktop
review at 1500×859 and phone review at 390×844 found no document-level
horizontal overflow. The search shortcut focused Search; compose focus entered
the recipient field and moved to Subject.

The separately approved `reference.png` attachment test passed using an
empty-recipient, empty-body temporary draft. Upload succeeded; the
authenticated download route returned 200 with `no-store` and `nosniff`, and
the downloaded file's SHA-256 matched the local image. The exact temporary
draft was moved from Drafts to Trash and verified there. No email was sent or
permanently deleted.

The offline scope route returned 200 with a valid scope; `/offline.html`
reported no saved copies. No message was opened or cached. The notification
poll route returned 200 with no Inbox changes and zero new IDs. At that check,
browser notification permission was `default` and alerts were off. The browser
was returned to the signed-in Inbox.

Phase 6 is complete. Phase 5 remains `in_progress` because the earlier
intermediate Trash-membership observation is unresolved and this account has no
Archive-role mailbox. Phase 7 offline sync/reconnect, account isolation, and
sign-out cache clearing remain unverified because no message was saved locally.
Phase 8 live notification delivery remains unverified. The approved checklist
excluded opening messages and granting notification permission. Do not send
email, change Stalwart settings, or use the admin API key.

On 2026-10-25, the user authorized a metadata-only lookup to identify the exact,
already-read message subject `Test` before caching it. The authenticated
candidate search returned four candidates across two threads, but none of the
candidate or member subjects exactly matched `Test`; the result was complete
and untruncated. No message detail was opened and no IndexedDB record was
created. Stop the Phase 7 live cache test until the exact target is
identifiable. The user separately approved browser notification permission
and one test email to `mail-client@rekad.id`. Ego TaskSpace 16 is currently
handed to the user because its browser-owned notification prompt appeared. Do
not interact with that space until the user confirms the prompt was handled;
then resume the same space.

## Phase 5 historical context

Phase 5 essential mailbox actions, search, threads, and drafts is in progress.
The plan is recorded in the Traycer artifact
`phase-5-mailbox-actions-search-threads-drafts-plan`. The user selected
all-mail search with an optional mailbox filter, grouped JMAP threads, JMAP
Drafts autosave, and thread-wide conversation actions with individual message
controls. Do not use the admin API key or change server-wide settings. Do not
mutate production mailboxes without separate explicit approval. At this earlier
checkpoint Phase 5 was the active scope; the user's later instruction to
continue through Phases 6–8 supersedes its stop-after-Phase-5 note.

Phase 5 implementation is committed in `1e8dc87` and `27f09aa`. It includes
server-side search, bounded conversation reads, safe JMAP message actions,
reply/forward prefills, JMAP Drafts revisions, and submission of saved draft
IDs through the Phase 4 idempotent send path. Draft autosave cleanup and
submission coordinate through an attempt-specific JMAP keyword and conditional
Email state updates, so cleanup cannot remove a draft after reservation for
send. Submission parsing accepts one primary result and at most one associated
implicit `Email/set`; ambiguous outcomes retain the marker to fail closed.
Thread summaries aggregate unread and starred state across members, respect
per-thread and `maxObjectsInGet` bounds, and count-only smoke checks skip that
work. Stale JMAP `notFound` results are validated and skipped where membership
can change during a read.

Local Phase 5 verification passes: `pnpm test` (87/87), `pnpm typecheck`,
`pnpm build`, and `git diff --check`. Commit `413ad2c` updates the mock JMAP
responses for thread membership/state aggregation and asserts the default
read keyword on created drafts. The build's generated `next-env.d.ts` change
was restored. With the user's approval, production deployment
`dpl_4Qec3Yi6Wep7z1DNGvUsjyhTsgLn` is Ready and aliased to
`https://webmail.rekad.id`; Vercel's remote build passed. The signed-in browser
review completed at desktop and 390px phone widths after approval for one
read-only first-page Inbox listing. It rendered one conversation with no visible
error and no horizontal overflow on phone. No message was opened and no mailbox
action was taken. The full record is in `phase-5-production-ui-review`.
The separately approved search for `Test` in All mail returned two conversation
summaries, neither with a displayed subject exactly `Test`. The record is in
`phase-5-production-search-check`. Because results are grouped by thread and no
thread was opened, exact target-message membership is unconfirmed. Further
search cases, thread detail, action persistence, and draft persistence remain
unverified and need separate authorization. The source-level UI review is in
`phase-5-ui-antislop-review`. The final independent code review found no
actionable issues; see `phase-5-hardening-parser-rereview-2026-10-24`. This was
the Phase 5 checkpoint before the user later directed continuing through
Phases 6–8.

The subject-only conversation metadata endpoint was implemented in commits
`28e2f02`, `0e9f038`, and `58219a4`. Final review's member-subject size finding
was fixed by bounding returned subjects to 512 characters while preserving raw
subjects for exact-match lookup. Local verification passes with 101/101 tests,
`pnpm typecheck`, and `pnpm build`. With the user's approval, deployment
`dpl_8Ztw8rj2rq3p1Nivr3ebDV4NrLrb` is Ready and aliased to
`https://webmail.rekad.id`. The authorized metadata-only POST for
`Fwd: Test Send` returned `404 thread_not_found`; no member subjects were
returned, no message body or preview was requested, and no mailbox state was
changed. The user later provided the exact stored subject; that retry and its
diagnosis are recorded below in `phase-5-production-search-check`.

The user supplied the exact subject `Re: Fwd: Test Send`; diagnostics were added
in commit `92649e1`. On production, `/api/auth/status` returned authenticated
mailbox access and verified the session account against the JMAP primary
account. The subject-only lookup returned `404 thread_not_found` with
`subject_query_empty` and zero candidate IDs. No `Email/get` or `Thread/get`
followed, so thread membership, message count, and member subjects remain
unknown. No body or preview was fetched and no mailbox state changed. Record is
in `phase-5-production-search-check`.

On 2026-10-25, the user authorized a broader subject-only candidate search in
the same signed-in account. `/api/auth/status` again passed authentication and
primary-account matching. Searching the partial subject `Test Send` returned
two `Email/query` candidates but no exact subject matches; exact candidates for
`Fwd: Test Send` and `Re: Test Send` were zero. The earlier route did not return
candidate subjects unless it resolved a thread, so those subjects and member
counts remained unknown. The evidence pointed to subject matching/value
differences; account scope passed, and thread identification was not reached.
No body or preview was fetched and no mailbox state changed.

The user approved continuing with a bounded subject-candidate metadata
endpoint and approved its exact production browser check. The endpoint is
committed as `095bfc4`; it returns candidate/member subjects and thread counts
only, caps JMAP fanout, and uses an 8-second operation deadline that returns an
explicit incomplete error. It passed 118/118 tests, `pnpm typecheck`,
`pnpm build`, and `git diff --check`. Independent re-review found no remaining
actionable issues; see `phase-5-subject-candidates-endpoint-final-review`.
Production deployment `dpl_9nBW19CiNWPoZghFave54kNsy7QD` is Ready and aliased
to `https://webmail.rekad.id`; Vercel's remote build passed.

The production metadata check completed after the user approved a replacement
TaskSpace. In TaskSpace 2, the first-account `/api/auth/status` result reported
`authenticated: true` and `mailboxAccess: true`. The approved POST to
`/api/mail/thread-subject-candidates` with `{"query":"Test Send"}` returned
HTTP 200. It returned one thread with two messages; candidate subjects were
`Re: Fwd: Test Send` and `Fwd: Test Send`, and member subjects were `Fwd: Test
Send` and `Re: Fwd: Test Send`. The exact subject provided by the user was
present. Disappearance counts were zero, member subject lookup and overall
results were complete, and subjects/results were not truncated. The Ego
TaskSpace was finished with no pages retained. No Inbox listing was opened,
message body or preview was fetched, and no mailbox state changed. Full record
is in `phase-5-production-search-check`.

Phase 5 remains `in_progress` because of the verification limits above. The
user later authorized proceeding through Phases 6–8. The temporary no-recipient
JMAP draft survived page reload, reopened with the exact saved subject/body and
empty recipient fields, then moved to Trash successfully. No message was sent
or permanently deleted. The result is in `phase-5-draft-persistence-check`.
A separately approved action check on that exact draft in Trash returned JMAP
HTTP 200 for `mark_unread`, `mark_read`, `star`, and `unstar`; the sequence
restored the draft's creation defaults (read and unstarred). No body or preview
was requested. The result is in `phase-5-state-actions-check`.

A separately approved `move` test moved the same test draft from Trash to
Drafts and back. Both JMAP action requests returned HTTP 200, and mailbox
listings confirmed its location after each step. It remains in Trash; no body
was requested, and the listing preview field was ignored. See
`phase-5-move-action-check`.

The user also authorized an archive check on the same temporary draft. The
first account's read-only mailbox role scan found Inbox and Trash but no
Archive role; the draft was already in Trash, so archive was skipped and no
mailbox action was submitted. It remains in Trash. See
`phase-5-archive-action-check`. Archive behavior remains unverified because
this account exposes no Archive role.

The user approved trash/restore on the exact `Re: Fwd: Test Send` member only
if it was uniquely in Inbox; it was uniquely in Sent, so that initial condition
did not run. The user separately approved reply/forward prefill on that member.
Both modes filled expected metadata and quoted text; each was autosaved as a
JMAP draft and moved from Drafts to Trash. The original message was already
read and remained read. No send occurred and body text was not included in the
report. See `phase-5-reply-forward-prefill-check`.

The user then approved the same reversible trash/restore test from Sent. The
exact message was confirmed uniquely in Sent and read. The JMAP Trash update
returned HTTP 200, but a bounded 10-second exact-ID listing poll did not show
it in Trash. The restore update returned HTTP 200; the exact ID then appeared
in Sent and was absent from Trash, with read state unchanged. The intermediate
Trash membership remains unverified. See `phase-5-regular-sent-trash-check`.
The account has no Archive role, so archive behavior is unavailable for
verification there. Completing the intermediate Trash check without loading a
body may require a read-only exact-message mailbox-membership endpoint. Under
`_harness/rules.md` and `PROMPT.md`'s email safety requirements, do not perform
further production mailbox writes or open messages that may fetch content or
change read state without separate explicit authorization. A specific target,
exact routes, state restoration plan, and content scope must be agreed before
those checks.

The user approved a read/star test on the regular email whose exact subject is
`Re: Fwd: Test Send`. The exact-subject `/api/mail/thread-subjects` request
returned 404 and no action was sent at that stage; see
`phase-5-regular-action-check`. The user then approved a `/api/mail?q=Test
Send` and `/api/mail/thread` fallback while ignoring preview fields. This
resolved one exact member in the two-message thread. Its original flags were
read and unstarred. JMAP confirmed `mark_unread`, `mark_read`, `star`, and
`unstar`; final thread readback confirmed the original flags were restored.
No body was requested and no other message was touched. Full result:
`phase-5-regular-message-flags-check`.

Phase 4 compose and send implementation and live verification are complete;
see the Traycer artifacts `phase-4-compose-send-plan` and
`phase-4-live-send-verification`, plus commits `fd9df24`, `931496a`,
`a42cc2a`, and `524f880`. The user selected a durable Postgres send-attempt
record; ambiguous outcomes fail closed and never auto-resend. Local checks pass:
87/87 tests, typecheck, and production build. The review artifact
`phase-4-compose-ui-review` contains three resolved findings.

The user approved deployment, the additive application database migration, and
one read-only production check. `pnpm db:migrate` succeeded, and production
deployment `dpl_5xekSb6sLYAwedgKp22aczkXeeBx` is Ready at
`https://webmail.rekad.id`. The read-only `/api/mail/identities` preflight in
ego-browser confirmed JMAP submission availability, Drafts and Sent roles, and
one non-wildcard identity (`mail-client@rekad.id`); the payload has no explicit
default flag, and compose auto-selects the sole identity. On 2026-10-24, one
plain-text test email was sent from that account to the explicitly approved
`carleanoravel@gmail.com`, with Cc and Bcc empty. The app reported submission
accepted by Stalwart, the matching message appeared in Sent Items, and the
signed-in recipient Gmail Inbox showed the matching unread message. No other
recipient was used. No Stalwart settings changed, and the admin API key was
not used.

Phase 3 safe email reading is complete. Local code now includes an
authenticated detail route, bounded JMAP body retrieval, server-side HTML
sanitization and sandboxed display, attachment metadata, and a same-origin
`Email/set` read-state path that patches only `$seen` after detail loads.
`pnpm test` passes 63/63, `pnpm typecheck` passes, and `pnpm build` passes. The
independent security review's three findings were fixed: local origin checks
require the exact app origin, message detail moves focus and restores it on
return, and an in-flight read update reconciles or refreshes the listing. The
final production deployment is `dpl_CuiyH16U1BCwhx6rH9V9bLGEjpRJ` at
`https://webmail.rekad.id`. In the first dedicated account, the authorized
“Test” message opened and rendered metadata plus plain and formatted bodies;
the unread count changed from 3 to 2. The HTML frame had an empty sandbox and
restrictive CSP. The initial browser check found a focus-return bug because the
trigger row was unmounted; commit `edc443c` fixes it by locating the recreated
row by email ID, and the final deployment passed the focus-to-heading and
focus-return checks. The local `pnpm jmap:smoke` account still reports an empty
Inbox, while the production OAuth session listed nine messages. No email was
sent or deleted. No Stalwart client or global setting changed.

Phases 0 through 3 are complete. The authenticated `/api/mail` route
verifies the JMAP primary account
against the app session, validates selected mailboxes against that account,
and returns only mailbox counts plus paginated sender/subject/date/unread/plain
preview fields. The React inbox provides mailbox selection, previous/next page,
manual refresh, empty/loading/error states, and the existing sign-out action.
The configured dedicated test account has an empty inbox, so no sample messages
are presented.

Phase 2 verification passed: all 45 tests, `pnpm typecheck`, `pnpm build`,
and a live read-only `pnpm jmap:smoke` result of five mailboxes, zero inbox IDs,
and zero summaries. An unauthenticated local request to `/api/mail` returned
`401 sign_in_required` with `Cache-Control: no-store` and `Vary: Cookie`.
Production deployment `dpl_DbN32jRh6FHVYRmV83AWC9JP1uBj` is Ready at
`https://webmail.rekad.id`. In the signed-in first dedicated test account, the
UI displayed five mailboxes and the true empty Inbox state. Selecting Drafts,
returning to Inbox, and manual refresh worked; refresh generated a new
`/api/mail` request. Previous/next controls were disabled at zero messages.
Live row display and page turns could not be exercised because the Inbox is
empty. No message was opened, sent, or changed. The user browser tab was
returned on Inbox without signing out.

Phase 0 and Phase 1 are complete. Production Authorization Code + PKCE sign-in
now succeeds with the existing `webmail` client and exact registered callback
`https://webmail.rekad.id/api/auth/callback/stalwart`. It performs PKCE/state/
nonce checks, validates the OIDC identity, verifies OAuth-token JMAP mailbox
access, and stores encrypted tokens in PostgreSQL behind an encrypted Auth.js
session cookie.

On 2026-10-23, production verification confirmed an authenticated app session,
OAuth-backed `Mailbox/get`, an expiry within the eight-hour app limit, and
logout that cleared the browser session and deleted the recent PostgreSQL
session row. No mailbox contents were returned or mutated.

On 2026-10-24, guarded production logout was verified from a signed-in session:
`/api/auth/session` was populated and `/api/auth/status` returned
`authenticated: true` and `mailboxAccess: true`; after the CSRF-protected
same-origin Auth.js sign-out POST, the session endpoint returned `null` and
status returned `401`. The built-in Auth.js confirmation form POST had
`Origin: null` in ego-browser and was correctly rejected with `403`; that
request left the session unchanged. The standard same-origin client flow
passed without relaxing the origin guard. The browser was left signed out.

On 2026-10-24, production account isolation passed in the shared browser. The
second dedicated test account had an active `/api/auth/session` and
`/api/auth/status` returned `200` with `authenticated: true` and
`mailboxAccess: true`. Signing it out returned the session endpoint to `null`
and status to `401`. The first configured dedicated test account then signed
in successfully; its session identity differed from the second account, and
its status also returned `200` with mailbox access. The browser is currently
signed in as the first test account. No message data was read and no mailbox
state was changed. During the first account's login, an agent-side parsing bug
caused one rejected credential attempt; Stalwart showed its generic invalid
username-or-password response, and the corrected configured credentials
succeeded without creating an app session for the rejected attempt.

On 2026-10-24, production natural-expiry refresh verification passed. The prior
access-token expiry was in the ~03:53 UTC window. After that window, read-only
session metadata showed the active access token expiring at 04:53:10 UTC with a
refresh token present. In the shared browser, `/api/auth/session` returned
HTTP `200` with an unexpired app session and `/api/auth/status` returned HTTP
`200` with `authenticated: true` and `mailboxAccess: true`. No token or
database state was modified to force refresh. No mailbox contents were read,
and browser control was returned with the first test account signed in.

The Phase 1 home page now starts the existing `stalwart` OAuth flow with a
server-side sign-in action and shows an active-session confirmation after
callback. The sign-in-page update was first deployed as
`dpl_6qeqHit7E4jQEYKDv2ejF7yYRwts`; the current release is
`dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. Read-only
HTTP verification confirmed the anonymous page contains the sign-in button and
returns `200`. Mailbox browsing remains Phase 2.

The signed-in home state now includes an accessible CSRF-protected sign-out
button. Commit `c9d8511` passed 22 tests, `pnpm typecheck`, and `pnpm build`;
production deploy `dpl_5JWtuf37v19z7CAiUoUSr38nkgar` is ready at
`https://webmail.rekad.id`. After deployment, the anonymous home page returned
`200`, the sign-in button was present, `/api/auth/session` returned `null`, and
`/api/auth/status` returned `401`. On 2026-10-24, the user signed in again and
the deployed sign-out button was clicked: the active session had mailbox
access before the click; afterward the app returned to the sign-in page,
`/api/auth/session` was `null`, `/api/auth/status` was `401`, and no error
message appeared. The browser was left signed out at the sign-in page.

For future Vercel CLI deployments, this repository is linked to the existing
`rekad/webmail-client` project. The first deployment attempt created a separate
`rekad/mail-client` project because the directory was not linked yet. On
2026-10-24, that extra project was deleted. Vercel's project and alias listings
now show only `rekad/webmail-client` and its aliases, including
`webmail.rekad.id`; neither `mail-client-nine.vercel.app` nor the extra
project's generated alias remains.

After the implementation review, refresh now preserves the application session
for transport, server, and malformed-response failures; an explicit
`invalid_grant` revokes it. Basic client credentials are form-encoded before
Base64 encoding. Expired rows are opportunistically removed on sign-in and
session lookups. This sweep has no scheduled runner yet, so dormant expired
rows can remain until the database is accessed again. The Auth.js sign-out POST
now checks the trusted app origin and revokes the app session before handing
the request to Auth.js. Session-ID lookup or deletion failures return `503`
without clearing the cookie, and cross-origin requests return `403`. Local
tests cover these behaviors. The guarded logout change was deployed as
`dpl_CAdcJ8jV2a7aozyYrEAfaVEQviyS`; the current page release is
`dpl_5JWtuf37v19z7CAiUoUSr38nkgar` at `https://webmail.rekad.id`. The guarded
logout flow passed end to end on production; a production database outage was
not simulated.

No Stalwart OAuth client or global setting was changed. Keep
`requireClientRegistration` and `anonymousClientRegistration` unchanged. The
missing `stalwart-webui` record is a future hardening prerequisite and not an
MVP blocker. The admin API key is never used for app authentication or mailbox
access. The provider-settings audit can remain deferred.

## Current safe step

The approved TaskSpace 16 checklist is complete and remains at the signed-in
Inbox. Ask the user to authorize opening and saving one exact test message
offline before attempting Phase 7 sync/cache-clearing checks. Ask separately
before granting notification permission or causing a test message to arrive.
Do not repeat the Phase 5 Trash mutation without renewed approval.

The new authenticated, body-free `/api/mail/location?emailId=...` endpoint was
deployed to `https://webmail.rekad.id` as
`dpl_CGdQH7WzTwFKF5eBTyq62NhQZSYu`. It reads only an exact email ID, mailbox IDs,
and mailbox roles, validates JMAP `notFound` coverage, and bounds session
discovery plus reads to an 8-second operation deadline. Local validation passed:
`pnpm typecheck`, `pnpm test` (130 tests), and `pnpm build`. Commits are
`f768144`, `22a1c57`, and `5c0f64f`.

The user authorized a read-only metadata check of exactly two messages with
stored subject `Re: Fwd: Test Send`, limited to sender addresses, sent/received
timestamps, and mailbox IDs/roles. The authenticated
`POST /api/mail/subject-metadata` implementation is committed in `27c93a5`,
`780b558`, and `03ec4f3`; candidate IDs and subjects remain server-side. The
shared query parser now requires `total` and validates a zero result position.
Independent re-review found no remaining issue. Local verification passes:
143/143 tests, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

Production deployment is blocked: `vercel deploy --prod --yes` returned
`Not authorized` for the linked `rekad/webmail-client` project;
`vercel whoami` reported `dev-31894631`. Do not try a different account,
token, project, or deployment workaround. The user needs to reauthenticate
Vercel CLI with an account that can deploy to the existing project or grant the
current account access. No production metadata call has run. The signed-in Ego
TaskSpace 1 was resumed only to check its URL and then handed back; no page
content was inspected.

After deployment access is restored, deploy the committed route and make only
the approved metadata POST in the same signed-in first-account TaskSpace. Do
not fetch message bodies or previews, send email, or change mailbox state.
Keep `requireClientRegistration` and `anonymousClientRegistration` unchanged,
and do not use the admin API key. See
[`phase-5-subject-match-metadata-check`](/Users/ravel/.traycer/epics/042d46d8-2356-4d23-ba9c-53d1b6c7f869/artifacts/phase-5-subject-match-metadata-check/index.md).

## Skill installation note

The Skills CLI could not resolve registry.npmjs.org, and direct raw GitHub
access could not resolve raw.githubusercontent.com. The local antislop skill is
therefore a clearly attributed project adaptation, not a verbatim upstream
package install. A Vercel React best-practices skill was researched as a useful
optional addition but could not be installed in this environment.

## Shared group mail and account switching (2026-10-28)

The refinements through `b7fb957` were deployed to webmail.rekad.id from a
clean `git archive` export of HEAD (Vercel is reachable again; the untracked
`reference.png` and scratch files were not uploaded).

**Group mail.** `lib/jmap/account-scope.mts` derives candidate accounts from a
fresh JMAP session: the primary account plus accounts with `isPersonal: false`
and the mail capability. The client never supplies an account list. Routes for
list, thread, detail, attachment download, original and actions accept an
`accountId` (query, or body for actions) that `createJmapApiContext` re-checks
against the live session on every call, with `expectedAccountId` still pinning
the OAuth session's primary account. Unknown or revoked accounts raise
`JmapSharedAccountUnavailableError` (404 `account_not_found`, session kept);
read-only accounts reject changes before any API call (403
`account_read_only`). `GET /api/mail/accounts` lists shared accounts; the
sidebar shows them above the mailbox list. Not done: sending as a group
identity, drafts inside a group account, a merged cross-account list, offline
copies, notifications for group mail. Not verified against the real
`core@rekad.id` account.

**Account switching.** Each browser keeps up to 4 sessions in an httpOnly
cookie (`rekad.accounts`) holding their Auth.js session tokens; switching
re-issues the Auth.js cookie for the chosen, still-valid session
(`lib/auth/linked-accounts.mts`, `/api/account/{linked,add,switch,remove}`).
Add-account sets a 10 minute intent cookie, then starts a new Stalwart sign-in
with `prompt=login`; the new session joins on the next list call. Stalwart may
ignore `prompt=login`: a repeat login of the same subject replaces and revokes
the older session instead of duplicating it. Removing an account revokes its
server session first. Tabs: the page's `accountHandle` is sent as
`x-rekad-account` on `/api/mail`, `/api/profile` and `/api/account` requests;
`getRequestOAuthSessionId` returns no session on a mismatch, and add/remove
return 409 `account_changed`, so a stale tab cannot act as, or sign out, the
newly selected account. Other tabs also reload through a BroadcastChannel.
Not verified in a real browser with two real accounts.
