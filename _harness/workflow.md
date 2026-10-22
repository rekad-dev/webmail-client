---
role: agent-instruction
scope: workflows
description: Execution, verification, and handoff procedures
---

# Workflows

## Session start

1. Read AGENTS.md, PROMPT.md, and the current handoff.
2. Check _harness/tracking/feature_list.json and _harness/tracking/progress.md.
3. Route the task and read only the relevant policy, workflow, and phase details.
4. Confirm which single roadmap phase is active; never assume permission to continue into the next phase.

## Phase work

Before implementation:

1. Inspect the repository and verify current framework, package manager, scripts, and deployment configuration.
2. State the phase outcome, scope, dependencies, risks, security considerations, acceptance criteria, and required tests.
3. Separate mock-based UI checks from evidence against a real or explicitly configured test Stalwart instance.
4. Ask about any user decision that would change product direction or an external system.

During implementation:

1. Make the smallest coherent changes within the phase.
2. Keep JMAP and session operations server-side; authorize each request for the authenticated account.
3. Use current Context7 documentation for framework, API, library, and CLI details.
4. Follow the micro-commit policy when Git is available.
5. Do not expand into later phases or add speculative infrastructure.

At phase completion:

1. Run the checks required by the active phase and report exact results, separating automated tests, real-server checks, and browser review.
2. Update feature status, progress, and durable memory only when supported by settled evidence.
3. Write a concise handoff with the next safe step.
4. Summarize what changed, what was verified, and what remains.
5. Stop and wait for the user's direction before moving to another phase.

## Browser checks

Use Obscura for configured automated/headless tests. For ego-browser use, first obtain approval naming routes, role/session, and a concrete checklist. Follow the detailed policy in _harness/rules.md and _harness/skills/browser-verification/SKILL.md.

