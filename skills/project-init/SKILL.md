---
name: project-init
description: Initialize a project for durable Codex context and cross-task handoffs. Use when the user asks to initialize, enable, or set up project context, AGENTS.md routing, or cross-window collaboration.
---

# Project Init

Use the deterministic CLI bundled with this plugin. Resolve the plugin root as two directories above this `SKILL.md`, then run:

```text
node <plugin-root>/dist/cli/main.js init --project <absolute-project-root>
```

Before running it, confirm the target directory from the current workspace. Do not initialize an unrelated directory.

After the command:

1. Read the JSON result.
2. Verify that `AGENTS.md`, `.agent/context.json`, and `.agent/handoff/index.json` exist.
3. Confirm that existing user-authored `AGENTS.md` content remains intact.
4. Report detected optional capabilities and the exact verification performed.

Do not create `planMsg.md` during initialization. Do not initialize CodeGraph, Serena, or OpenSpec.

