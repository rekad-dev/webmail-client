---
role: agent-instruction
scope: task-routing
description: Task-to-file mapping
---

# Task Routing

Route by task before loading more files.

| Task | Read first |
|---|---|
| Product goal, roadmap, acceptance criteria | PROMPT.md; then the relevant phase only |
| Session continuity | _harness/tracking/session-handoff.md and _harness/tracking/progress.md |
| Current phase state | _harness/tracking/feature_list.json |
| Next.js, React, TypeScript, UI libraries, APIs, or CLI setup | Context7: resolve the exact library ID, then query current docs for the single concept |
| Stalwart or JMAP integration | PROMPT.md sections on architecture and Stalwart connectivity; then current official Stalwart/JMAP docs and applicable RFCs |
| Authentication, sessions, authorization, SSRF, email HTML, or attachments | PROMPT.md security and architecture requirements; use current primary documentation for implementation details |
| UI, copy, accessibility, responsive behavior | _harness/skills/antislop/SKILL.md and PROMPT.md UI guidelines |
| Automated browser checks | _harness/skills/browser-verification/SKILL.md, then the relevant project test script |
| Harness change or audit | _harness/skills/harness/SKILL.md and the relevant _harness document |
| Infrastructure or deployment | PROMPT.md connectivity and deployment notes; ask before infrastructure changes |

## Boundary points

- PROMPT.md describes intended phases; it does not authorize skipping ahead.
- The proposed stack is a starting point. Verify the actual package manifest and current documentation before relying on a library or version.
- A mock is suitable for isolated UI work and tests. It is not evidence that a product integration is complete.
- Use official Stalwart and JMAP sources when a relevant Context7 entry is unavailable.
