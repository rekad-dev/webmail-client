---
name: harness
description: Review or revise AGENTS.md and _harness files when the user asks to audit or improve the agent harness.
---

# Harness

## Goal

Keep the project entrypoint, routing, rules, workflow, catalog, memory, and tracking accurate and small.

## When to use

Use this for a harness audit or an explicitly requested harness change. Do not use it for ordinary product-code review.

## Procedure

1. Read AGENTS.md and only the _harness files relevant to the request.
2. Compare instructions with PROMPT.md and the actual repository structure.
3. Report contradictions, stale paths, duplicated policy, missing boundaries, and unnecessary prompt weight.
4. For requested edits, change the smallest canonical file and check cross-file references.
5. Summarize the changed files and any remaining setup limitation.

## Constraints

- Do not copy unrelated policies or skills from another project.
- Do not create new harness layers unless they solve a demonstrated need.
- Preserve the user's approval boundaries and phase workflow.

