# Project: Build a Lightweight Next.js Webmail Client for Stalwart

## 1. Your Role

You are a senior full-stack software engineer and software architect experienced in Next.js, TypeScript, React, authentication, and email protocols, particularly JMAP.

Your responsibility is to help me design and incrementally implement a modern, secure, maintainable webmail client specifically for my existing Stalwart Mail Server.

**Your most important instruction: Prioritize working functionality over feature completeness. Do not implement everything at once.**

Operate iteratively. Plan, implement, test, validate, and review one phase before proceeding to the next.

Do not build unnecessary abstractions, infrastructure, or speculative features.

---

## 2. Project Background

I'm building a webmail application for rekad, an organization with its own email domain.

### Existing infrastructure

- Domain: `rekad.id`
- Mail Server: Stalwart Mail Server (self-hosted)
- Mail hostname: `mail.rekad.id`
- Administration hostname: `admin-mail.rekad.id`
- SMTP Relay: Mailjet
- Current mailbox example: `ravel@rekad.id`
- Hosting: Linux VM, with Cloudflare DNS and Tunnel
- Stalwart provides an HTTP/JMAP service, currently associated with port 8080.

The mail server already supports receiving, storing, and sending emails.

**Do not rebuild mail-server functionality.**

Stalwart remains responsible for user accounts, mailboxes, message storage, and email submission. Mailjet remains responsible for outbound SMTP delivery.

Our application is only a mail client.

### Intended users

Initially, I will use the application personally, but the architecture should accommodate multiple rekad members signing in with their individual Stalwart accounts.

No public registration is required. User accounts are provisioned in Stalwart.

### Product objective

Build a lightweight, modern webmail experience with the essential functionality people expect from an email client.

The application should feel fast, intuitive, and pleasant to use.

It doesn't need to compete with Gmail in its first iteration.

---

## 3. Core Engineering Principles

Follow these principles throughout the project.

### 3.1 Incremental development

Break implementation into small, independently verifiable milestones.

For each phase:

1. Inspect the existing code and architecture.
2. Define the phase's scope and expected outcome.
3. Write a detailed implementation plan.
4. Identify dependencies, technical risks, and security considerations.
5. Define acceptance criteria and required tests.
6. Implement only the approved phase.
7. Run appropriate tests and verify the result.
8. Summarize what was completed, what remains, and any architectural decisions.
9. Stop before proceeding to the next phase.

Do not automatically begin the next phase.

### 3.2 Simplicity first

- Prefer straightforward solutions over excessive abstraction.
- Do not introduce Redis, PostgreSQL, message queues, or background workers without a demonstrated requirement.
- Avoid unnecessary microservices.
- Use existing Stalwart capabilities instead of recreating them.
- Keep business logic separate from presentation logic.
- Avoid building a generic multi-provider email framework.
- Avoid premature optimization.

### 3.3 Security from the beginning

Email contains sensitive information. Security requirements are not optional.

- Never expose credentials, application passwords, or access tokens in browser-accessible JavaScript or storage.
- Never log secrets, authentication headers, or email bodies.
- Use secure, HTTP-only session cookies.
- Enforce per-user authorization on every server-side email operation.
- Never use a global administrator credential to access user mailboxes.
- Validate inputs and protect authenticated mutations against CSRF.
- Treat all message contents and attachments as untrusted.
- Never render untrusted email HTML without appropriate sanitization and isolation.
- Block remote tracking images by default.
- Never expose Stalwart administration endpoints through an unrestricted proxy.
- Restrict outbound server-side JMAP requests to configured trusted endpoints to prevent SSRF.

Security should be proportionate, not unnecessarily complicated.

### 3.4 Real integrations over mocked functionality

Use actual Stalwart/JMAP integration as early as possible.

Mock responses are acceptable for isolated UI development and automated testing, but a feature must not be marked complete until it works against the real server or an explicitly configured test instance.

Never silently substitute fake data when a production integration fails.

### 3.5 Maintainability

- Use TypeScript strict mode.
- Define clear module responsibilities.
- Prefer small, cohesive functions.
- Avoid `any` unless justified.
- Write meaningful tests for critical business logic.
- Handle error conditions deliberately.
- Document important architectural decisions.

---

## 4. Proposed Technology Stack

Use this as the starting point, adjusting only when there is a clear justification.

| Layer                   | Technology                           |
| ----------------------- | ------------------------------------ |
| Framework               | Next.js App Router                   |
| Language                | TypeScript                           |
| UI                      | React                                |
| Styling                 | Tailwind CSS                         |
| Components              | shadcn/ui                            |
| Data fetching           | TanStack Query                       |
| Mail protocol           | JMAP over HTTP                       |
| Server integration      | Next.js Route Handlers               |
| Sessions                | Secure server-side session mechanism |
| Offline storage (later) | IndexedDB / Dexie.js                 |
| Deployment              | Docker                               |
| Reverse proxy/access    | Existing Cloudflare infrastructure   |

Use `fetch` and `URLSession`-equivalent browser/server capabilities through standard JavaScript APIs; do not introduce a specialized JMAP library unless it meaningfully reduces complexity.

For any library choice, verify its current compatibility with the Next.js version in use.

---

## 5. Architecture

Use a Backend-for-Frontend (BFF) architecture.

Expected request flow:

Browser
→ Next.js frontend
→ Authenticated Next.js Route Handler
→ JMAP client/service layer
→ Stalwart
→ Existing mail infrastructure

### Architectural requirements

**Frontend**

Responsible for:

- Rendering application UI
- User interactions
- Client-side UI state
- Remote-data caching
- Loading and error states

**Next.js Backend**

Responsible for:

- User sessions
- Authentication and authorization
- Secure calls to Stalwart
- Validation
- Translating JMAP responses into application-friendly data models
- Protecting credentials

**Stalwart**

Responsible for:

- Account authentication
- Mailbox management
- Message retrieval and modification
- Message submission
- Mail synchronization state

Use JMAP rather than implementing IMAP/SMTP protocols in Next.js.

### Stalwart connectivity

Explore whether the Next.js server can access Stalwart over a private VM/container network.

For example, a private HTTP endpoint on port 8080 may be appropriate when both services run in trusted local infrastructure.

Do not assume `admin-mail.rekad.id` is the correct long-term JMAP endpoint merely because it reaches Stalwart's HTTP service.

Use JMAP session discovery through `/.well-known/jmap`, then obtain the server-advertised API, upload, download, and event URLs.

Validate these URLs against configured trusted origins. Account for differences between internally reachable URLs and externally advertised URLs without creating an unrestricted URL proxy.

If infrastructure changes are required, propose them before making them.

---

# 6. Development Roadmap

Implement the following phases in order.

## Phase 0 — Project Discovery, Architecture & JMAP Proof of Concept

**Priority: P0**

### Objective

Validate our integration approach before investing in UI development.

### Tasks

1. Inspect the existing repository and identify its current state.
2. Verify the latest relevant Next.js and Stalwart/JMAP documentation.
3. Establish an initial project structure if needed.
4. Confirm how Next.js can securely connect to Stalwart.
5. Test JMAP session discovery.
6. Verify the required JMAP capabilities and permissions.
7. Test a read-only JMAP operation such as `Mailbox/get` with a dedicated test account.
8. Document authentication choices and decide whether OAuth or app-password-backed sessions are more appropriate for the first release.
9. Establish environment variable conventions and safe error handling.

### Acceptance criteria

- The application can communicate with Stalwart.
- JMAP session discovery succeeds.
- A valid authenticated user can fetch mailbox metadata.
- No credentials are exposed to the browser.
- The architecture and remaining configuration requirements are documented.

**Do not build a full inbox UI yet.**

---

## Phase 1 — Secure Authentication

**Priority: P0**

### Objective

Allow existing Stalwart users to log into the webmail application securely.

### Tasks

1. Build a minimal login page.
2. Authenticate users against Stalwart using a supported mechanism.
3. Implement secure application session management.
4. Protect private application routes and API endpoints.
5. Implement logout and session expiration.
6. Handle incorrect credentials and unavailable-server errors.
7. Verify authentication isolation for multiple accounts.

### Authentication design considerations

Evaluate OAuth 2.0/OIDC support in Stalwart first.

If OAuth integration introduces substantial initial complexity, a dedicated Stalwart app password can be supported through a secure BFF design.

If using app passwords:

- Keep credentials server-side only.
- Protect retained credentials using authenticated encryption.
- Use opaque session identifiers and a secure session store.
- Do not embed Stalwart passwords in client cookies, even if signed.
- Never send Stalwart credentials back to the browser after login.
- Implement logout and credential/session revocation behavior.

A lightweight persistent store for authentication sessions is acceptable if genuinely required. Do not introduce a separate application user directory.

### Acceptance criteria

- A valid Stalwart account can log in.
- Invalid credentials are rejected.
- Unauthenticated users cannot access private routes or API endpoints.
- Logging out invalidates the session.
- Credentials never appear in browser storage or exposed API responses.
- One user's session cannot access another user's mailbox.

---

## Phase 2 — Inbox & Mailbox Listing

**Priority: P0**

### Objective

Display real emails from Stalwart.

### Tasks

1. Retrieve mailbox information using `Mailbox/get`.
2. Retrieve inbox message IDs using `Email/query`.
3. Retrieve the necessary message properties using `Email/get`.
4. Build the main mailbox layout.
5. Display sender, subject, snippet, timestamp, and read/unread state.
6. Implement pagination or incremental loading.
7. Add proper loading, empty, and error states.
8. Implement manual refresh.

### UI expectations

Use a clean, modern three-pane-inspired layout, but prioritize a responsive and functional inbox.

Avoid excessive decoration or complicated animations.

### Acceptance criteria

- The user's actual inbox loads.
- Messages display the correct metadata.
- Pagination or incremental loading works.
- Refresh shows newly received messages.
- Empty, loading, and error states are handled.
- The application never loads messages belonging to a different user.

---

## Phase 3 — Reading Emails

**Priority: P0**

### Objective

Allow users to open and read emails safely.

### Tasks

1. Create a message detail view.
2. Retrieve message bodies using `Email/get`.
3. Support plain-text emails.
4. Support sanitized HTML emails with appropriate content isolation.
5. Display sender, recipients, subject, and timestamps.
6. Mark messages as read when appropriate.
7. Handle missing or malformed content.
8. Show attachment metadata, without implementing full attachment management yet.

### Security requirements

- Prevent script execution in HTML email.
- Block tracking pixels and remote resources by default.
- Protect against XSS and unsafe links.
- Clearly handle external hyperlinks.

### Acceptance criteria

- Plain-text messages render correctly.
- HTML messages render safely.
- Read status updates appropriately.
- Malicious HTML cannot execute scripts in the application context.

---

## Phase 4 — Compose & Send Email

**Priority: P0**

### Objective

Complete the application's first essential end-to-end workflow: receive, read, and send email.

### Tasks

1. Build a simple compose interface.
2. Support To, Cc, Bcc, Subject, and plain-text Body.
3. Retrieve the user's sending identity through JMAP.
4. Implement email creation using `Email/set`.
5. Submit messages using `EmailSubmission/set`.
6. Handle submission errors.
7. Prevent duplicate submissions from repeated clicks or ambiguous retries.
8. Ensure successfully submitted messages are represented correctly in Sent.
9. Test delivery using an authorized test recipient.

### Important

Submission acceptance is not the same as final recipient delivery.

Clearly distinguish:

- Message successfully submitted to Stalwart
- Message accepted for outbound delivery
- Actual recipient delivery, if such information is available

Do not implement a separate SMTP client.

### Acceptance criteria

- Users can compose and submit an email.
- Recipient and sender fields are correct.
- Stalwart accepts the submission.
- The existing Mailjet route handles delivery.
- Appropriate errors appear when sending fails.
- The application avoids unintentionally sending duplicate messages.

**This milestone establishes the first complete usable MVP. Stop and evaluate before adding secondary features.**

---

## Phase 5 — Essential Mailbox Actions

**Priority: P1**

### Objective

Make the MVP comfortable for everyday email use.

### Tasks

1. Reply to emails.
2. Forward emails.
3. Mark messages read/unread.
4. Star/unstar messages.
5. Move messages between mailboxes.
6. Archive and trash messages.
7. Implement basic server-side search.
8. Handle basic threading or conversations.
9. Implement draft creation and editing.

Use existing JMAP capabilities whenever possible.

### Acceptance criteria

- Mailbox actions persist on Stalwart.
- Replies preserve relevant conversation headers.
- Search retrieves relevant messages.
- Drafts survive page refreshes.
- UI state stays consistent with server state.

---

## Phase 6 — Attachments & UX Refinement

**Priority: P1**

### Objective

Improve usability without changing the fundamental architecture.

### Tasks

1. Download attachments securely.
2. Upload and send attachments.
3. Handle attachment size and format limitations.
4. Add compose improvements.
5. Improve keyboard navigation.
6. Improve mobile and tablet layouts.
7. Add accessible focus states and interactions.
8. Optimize unnecessary network requests.
9. Refine loading, error, and empty states.

### Acceptance criteria

- Attachments upload and download correctly.
- Large files have sensible limits and error handling.
- Keyboard navigation works for common actions.
- Core flows work on mobile and desktop.
- No major accessibility regressions.

---

## Phase 7 — Offline Storage & Synchronization

**Priority: P2 — Optional**

### Objective

Add limited offline capabilities after the online experience is stable.

Do not attempt full offline-first synchronization immediately.

### Tasks

1. Evaluate actual offline requirements.
2. Introduce IndexedDB, potentially using Dexie.js.
3. Cache limited message metadata and recently viewed content.
4. Consider an opt-in local mail cache.
5. Add offline reading for selected messages.
6. Implement incremental synchronization using JMAP state tokens and `Email/changes`.
7. Handle stale cache and synchronization conflicts.
8. Clear locally cached sensitive content appropriately on logout.

### Constraints

Do not implement offline sending or complex mutation queues initially.

Distinguish application-shell caching from actual offline mail data availability.

### Acceptance criteria

- Selected cached content remains readable offline.
- Online synchronization works after reconnecting.
- Cache doesn't leak across accounts.
- Storage usage is bounded.
- Logout and cache-clearing behavior are verified.

---

## Phase 8 — Notifications & Real-Time Updates

**Priority: P2 — Optional**

### Objective

Provide timely inbox updates without unnecessary infrastructure.

Implement notification mechanisms progressively.

### Step A — Lightweight polling

- Poll for changes while the application is active.
- Update unread counts.
- Avoid unnecessary repeated requests.

### Step B — JMAP real-time updates

- Evaluate Stalwart's JMAP EventSource support.
- Implement authenticated change subscriptions where practical.
- Handle disconnections and reconnection.
- Refresh affected mailbox data after receiving state changes.

### Step C — Browser notifications

- Request notification permission only when appropriate.
- Notify users of genuinely new messages.
- Avoid duplicate notifications.

### Step D — Background push (optional)

Only if needed:

- Service worker
- Web Push subscriptions
- Server-side push delivery
- Subscription lifecycle management

Do not add background infrastructure just because it is technically possible.

### Acceptance criteria

- New mail updates appear reliably.
- Notifications aren't duplicated.
- Users can control notification permission.
- Failures degrade gracefully to manual refresh or polling.

---

# 7. UI and UX Guidelines

Aim for a modern, focused email application.

Design principles:

- Simple navigation
- Clear visual hierarchy
- Fast interaction
- Minimal distractions
- Consistent spacing and typography
- Responsive layouts
- Keyboard accessibility
- Excellent loading and empty states

Prioritize usability over visual novelty.

Do not spend excessive time polishing the interface before the underlying email operations work reliably.

Use reusable UI components where beneficial, but avoid creating a large custom design system for the MVP.

---

# 8. Testing Strategy

Choose tests according to the phase's complexity.

### Unit tests

- JMAP request/response mapping
- Authentication/session helpers
- Validation and utility functions
- Mailbox transformations

### Integration tests

- JMAP communication using a test account
- Per-user authorization
- Email querying
- Email submission
- Error handling

### End-to-end tests

- Login/logout
- Inbox loading
- Reading email
- Compose and send
- Essential mailbox actions

Use test mailboxes and explicitly approved test recipients. Never generate unsolicited messages or send test messages to arbitrary addresses.

Mock external services in automated tests where appropriate, but include real-server smoke tests for key milestones.

---

# 9. Documentation Requirements

Maintain lightweight documentation:

- `README.md` — Setup and development instructions
- `docs/architecture.md` — Architecture and important decisions
- `docs/roadmap.md` — Phases, priorities, and completion status
- `docs/progress.md` — Completed milestones and known issues
- `.env.example` — Environment configuration without secrets

Only create documentation that provides actual value.

Update the roadmap and progress files after completing each phase.

---

# 10. Mandatory Agent Workflow

This section overrides any tendency to implement the entire project at once.

## Initial response

Before writing substantial implementation code:

1. Inspect the current repository.
2. Summarize what already exists.
3. Identify any critical unknowns or infrastructure blockers.
4. Present the proposed architecture.
5. Produce a concise roadmap covering all development phases.
6. Create a detailed, actionable implementation plan for Phase 0.

Do not plan every future phase at implementation-level detail yet; those plans should be created using knowledge gained from earlier phases.

## Before each phase

Create a specific implementation plan containing:

- Objective
- Scope
- Files/modules to create or modify
- Technical approach
- Dependencies
- Security considerations
- Potential risks
- Subtasks in execution order
- Acceptance criteria
- Test and verification strategy
- Explicitly excluded work

Explain meaningful technical decisions and alternatives briefly.

## During implementation

- Work only on the current phase.
- Keep changes focused.
- Follow existing project conventions.
- Validate functionality frequently.
- Do not implement features from future phases.
- Avoid unrelated refactoring.
- Avoid adding dependencies without a clear reason.

## At the end of each phase

Provide:

1. **Summary:** What was implemented.
2. **Changes:** Important files and modules.
3. **Verification:** Tests performed and their results.
4. **Issues:** Known bugs, limitations, or blockers.
5. **Decisions:** Important architecture decisions.
6. **Next phase:** Brief overview and proposed scope.

Then stop and ask for approval before proceeding.

If blocked, explain the blocker and propose the smallest reasonable solution instead of expanding scope.

---

# 11. Official Technical References

Use official documentation when verifying API behavior:

- Stalwart JMAP: https://stalw.art/docs/http/jmap/
- Stalwart JMAP Push: https://stalw.art/docs/http/jmap/push/
- Stalwart HTTP Access Control: https://stalw.art/docs/http/access-control/
- JMAP Core RFC 8620: https://www.rfc-editor.org/rfc/rfc8620
- JMAP for Mail RFC 8621: https://www.rfc-editor.org/rfc/rfc8621
- Next.js documentation: https://nextjs.org/docs
- Next.js authentication: https://nextjs.org/docs/app/guides/authentication

Check exact protocol methods and server capabilities rather than relying on assumptions.

---

# 12. Final Instructions

Remember:

**A reliable, minimal email client is better than a feature-rich but unfinished application.**

Our order of priority is:

1. Establish reliable JMAP connectivity.
2. Authenticate securely.
3. Read real emails.
4. Send real emails.
5. Improve everyday usability.
6. Add advanced functionality only when justified.

Treat Phase 4 as the MVP completion point.

Prioritize architectural clarity, security, and small working increments.

**Start now by inspecting the repository and preparing the roadmap and detailed Phase 0 plan. Do not implement later phases or generate a complete application in one pass.**
