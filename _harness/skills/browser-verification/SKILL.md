---
name: browser-verification
description: Choose Obscura for configured automated browser tests and ego-browser for approved interactive user flows or visual review.
---

# Browser Verification

## Choose the browser

- Use Obscura for automated headless smoke tests, Playwright suites, and DOM assertions when the repository has a working Obscura setup.
- Use ego-browser for signed-in interactive flows, visual inspection with the user, or actions that require human intervention.
- Read the installed ego-browser skill for its current API and runtime instructions. Do not guess its methods.

## Approval for ego-browser

Before starting ego-browser, ask for explicit approval. State:

1. The exact routes or URLs.
2. The role or session state.
3. The concrete elements and flows to check.

Wait for approval before opening or interacting with the browser. Preserve user-owned tabs and sessions.

## Mail-specific boundaries

- Prefer local or explicitly configured test instances for automated checks.
- Do not send real email, alter a real mailbox, or change server-side state unless the user explicitly approves the action and target.
- Do not use a browser to bypass a failed or unavailable JMAP integration.
- If Obscura is unavailable or unconfigured, explain the limitation and ask before substituting another browser for an automated run.

