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
