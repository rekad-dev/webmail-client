---
role: agent-instruction
scope: gc-policy
---

# Cleanup Policy

## Short-term agent memory

Target: _harness/memory/agents/*.local.md

- Keep only active, task-specific context.
- Remove completed or obsolete notes.
- Do not commit agent-local working notes.

## Project memory

Target: _harness/memory/project.md

- Keep durable decisions and lessons that cannot be inferred from PROMPT.md or code.
- Remove or supersede outdated information.
- Merge duplicates and keep entries concise.

## Harness files

Keep rules, workflow, routing, and catalog entries short and aligned with the actual repository. Do not copy whole product specifications into the harness.

