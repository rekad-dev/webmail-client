# AGENTS.md

This repository uses a small harness. Read this entrypoint, then route to the minimum relevant files under _harness/.

## Session entry

1. Read PROMPT.md and _harness/tracking/session-handoff.md.
2. Classify the task with _harness/routing.md; load only the documents needed.
3. Before implementation, follow _harness/rules.md and _harness/workflow.md.
4. Work on one roadmap phase at a time. Stop after that phase; do not begin the next phase automatically.
5. Use Context7 for current library, framework, API, CLI, and cloud-service documentation: resolve the library ID first, then query one concept at a time.

## Project boundary

PROMPT.md is the authoritative product brief. This repository is a webmail client for Stalwart, using a Next.js backend-for-frontend and JMAP. It must not recreate mail-server responsibilities.

## Model default

Request exact gpt-6-luna when the runtime exposes model selection. If another model is active or needed, ask the user to confirm that model by name. Do not switch models automatically or stop the whole turn; continue independent work and leave only model-dependent work pending until the user answers. Details are in _harness/rules.md.

## Skill routing

- UI, copy, accessibility, and responsive design: _harness/skills/antislop/SKILL.md
- Browser verification with Obscura or ego-browser: _harness/skills/browser-verification/SKILL.md
- Harness review and maintenance: _harness/skills/harness/SKILL.md

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
