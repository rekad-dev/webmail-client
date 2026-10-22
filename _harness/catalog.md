---
role: agent-instruction
scope: structure-lookup
description: Current repository structure and module lookup
---

# Repository Catalog

## Present at harness setup

| Path | Purpose |
|---|---|
| PROMPT.md | Product brief, architecture, roadmap, constraints, and acceptance criteria |
| AGENTS.md | Short agent entrypoint and routing |
| _harness/ | Project rules, workflow, routing, memory, tracking, setup templates, and local skills |
| _harness/skills/antislop/ | Project-focused UI and copy quality skill adapted from the linked upstream project |
| _harness/skills/browser-verification/ | Project policy for Obscura and ego-browser verification |

## Application source

| Path | Purpose |
|---|---|
| `app/` | Minimal Next.js App Router placeholder and root styling |
| `lib/jmap/phase0-poc.mts` | Server-side JMAP discovery, endpoint validation, and read-only mailbox smoke check |
| `scripts/jmap-smoke.mts` | Local discovery and authenticated smoke commands |
| `tests/jmap-poc.test.mts` | Focused tests for the Phase 0 JMAP proof of concept |
| `docs/` | Architecture, roadmap, progress, and detailed Phase 0 plan |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts` | App tooling and strict TypeScript configuration |
