---
name: project-sync
description: Explicitly rescan and synchronize an initialized project's managed Codex context after project tools, source, test, specification, reference locations, or stable routing rules change. Use only when the user explicitly invokes this Skill or explicitly asks to synchronize project context; never trigger automatically after observing filesystem changes.
---

# Project Sync

Synchronize only an already initialized project. Never use this Skill as an implicit substitute for `project-init`.

## Prepare

1. Read [resource-rules.md](references/resource-rules.md) before classifying additions or removals.
2. Resolve the project root by locating `.agent/context.json` upward from the confirmed workspace.
3. Record the current `AGENTS.md` content outside the plugin-managed boundary.
4. Record the current context and handoff index schema versions and entry count.

Do not initialize, update, or repair optional tools. Do not read full reference documents merely because their paths were discovered.

## Synchronize

Resolve the plugin root as two directories above this `SKILL.md`, then run:

```text
node <plugin-root>/dist/cli/main.js sync --project <absolute-project-root>
```

Synchronization may update only:

- `.agent/context.json` discovery metadata;
- a missing or migratable `.agent/handoff/index.json`;
- content between the project-context managed boundary markers in `AGENTS.md`.

It must not create `.agent/planMsg.md`, modify handoff Markdown files, or replace user-authored `AGENTS.md` content.

## Verify

1. Require `ok: true` in the JSON result.
2. Confirm the managed boundary appears exactly once.
3. Confirm content outside the boundary is unchanged.
4. Confirm all indexed handoff entries remain present after schema migration.
5. Confirm source, test, specification, and resource paths reflect current project evidence.
6. Run synchronization a second time and require byte-stable output when the project did not change.
7. Report additions, removals, classification changes, and migrations separately.
8. Confirm OpenSpec-owned paths are not rendered in `Project References`, broad Development, Specification, and Completion sections remain absent, explicit invocation metadata is not repeated, and the context section names remain present.
