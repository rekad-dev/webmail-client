---
role: agent-instruction
scope: constraints
description: Project boundaries, safety rules, and confirmation gates
---

# Rules

## Autonomy and phase boundaries

- Work autonomously within the active, user-approved phase.
- Do not start the next roadmap phase automatically. Finish the current phase, report its evidence and remaining work, and wait for the user's direction.
- Propose infrastructure changes before changing VM configuration, DNS, Cloudflare, mail-server settings, or external services.
- Do not present mock data or a failed integration fallback as real persisted mail.

## Email and account safety

- Never expose passwords, application passwords, access tokens, authentication headers, or email bodies in browser-accessible code, storage, logs, fixtures, or commits.
- Keep credentials and privileged JMAP calls on the server. Use secure HTTP-only session cookies and enforce per-user authorization on every mail operation.
- Never use a global administrator credential to access a user's mailbox.
- Validate JMAP session-discovery URLs and advertised API, upload, download, and event URLs against configured trusted origins. Do not create an unrestricted URL proxy.
- Treat message bodies and attachments as untrusted. Sanitize and isolate HTML email, block remote tracking images by default, validate uploads and downloads, and make external links clear.
- Do not register accounts. Stalwart provisions users.
- Send test email only to an explicitly approved test recipient. Do not send unsolicited or arbitrary test messages. Ask before sending any real message or performing a live mailbox mutation.

## Model confirmation

- Default to exact gpt-6-luna when the runtime exposes model selection.
- If a different model is active or required, ask the user to confirm that model and state why it is needed. Do not change models automatically.
- Asking does not end the turn. Continue independent work that is safe under the active runtime; keep only model-dependent work pending until the user responds.
- Apply the same confirmation rule before starting or continuing any delegated worker.

## Micro-commits

- When this project is a Git repository, commit each smallest coherent change before moving to a separate logical unit. Keep commit messages specific and explain non-obvious intent.
- Stage only files owned by the current task. Preserve unrelated user changes and never rewrite, stage, or discard them without direction.
- Do not initialize Git solely to satisfy this rule. If no Git repository exists or a commit cannot be made, continue safely and report that limitation.

## Browser policy

- Use Obscura for automated, headless browser checks and Playwright suites when it is configured for the project.
- Use ego-browser for interactive, signed-in flows, visual review with the user, or steps needing human intervention.
- Before using ego-browser, ask for explicit approval and name the exact routes, role or session state, and checklist. Do not proceed until approval arrives.
- Do not use either browser to send mail or mutate a real mailbox unless the user has explicitly authorized the action and target.
- If Obscura is unavailable, explain that and ask before substituting another browser for an automated check. Do not assume a CDP port or launch command that the project has not configured.

## Current documentation

For library, framework, SDK, API, CLI, or cloud-service questions, use Context7. First resolve the library ID, then query current documentation for one concept at a time. Prefer primary sources for protocol and security behavior.

## Skills

- Apply _harness/skills/antislop/SKILL.md to UI, copy, accessibility, and responsive work.
- Apply _harness/skills/browser-verification/SKILL.md to browser checks.
- Read only the relevant skill for the task.

