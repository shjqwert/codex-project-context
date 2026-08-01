---
name: project-sync
description: Synchronize an initialized project's Codex context metadata after tools, references, or project structure change. Use for project context refresh or AGENTS.md resource synchronization.
---

# Project Sync

Resolve the plugin root as two directories above this `SKILL.md`, then run:

```text
node <plugin-root>/dist/cli/main.js sync --project <absolute-project-root>
```

The command must update only `.agent/context.json`, a missing handoff index, and the plugin-managed block between `PROJECT_CONTEXT_START` and `PROJECT_CONTEXT_END` in `AGENTS.md`.

Afterward, verify the JSON result and review the managed block. Never replace unrelated `AGENTS.md` content. Do not initialize or upgrade optional tools.

