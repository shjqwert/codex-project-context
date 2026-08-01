---
name: project-init
description: Explicitly initialize a named project for durable Codex context by discovering project evidence, generating or incrementally merging a complete AGENTS.md, and creating context and handoff metadata. Use only when the user explicitly invokes this Skill or explicitly asks to initialize project context; never trigger implicitly from missing files.
---

# Project Init

Initialize only the project the user named or the confirmed current workspace. Never initialize another directory by inference.

## Prepare

1. Read [project-discovery.md](references/project-discovery.md) before interpreting detected project evidence.
2. Read [agents-structure.md](references/agents-structure.md) before validating the generated `AGENTS.md`.
3. Resolve the plugin root as two directories above this `SKILL.md`.
4. Record whether `AGENTS.md`, `.agent/context.json`, and `.agent/handoff/index.json` already exist.
5. If `AGENTS.md` exists, preserve a copy or hash of content outside the plugin-managed boundary.

Do not read entire manuals, schematics, or large project references during discovery. Path, filename, manifest, and configuration evidence are sufficient.

## Initialize

Run the deterministic CLI:

```text
node <plugin-root>/dist/cli/main.js init --project <absolute-project-root>
```

The command may:

- discover project type, languages, source/test locations, specification directories, and reference paths;
- create or refresh `.agent/context.json`;
- create a missing schema v2 handoff index;
- create a complete managed `AGENTS.md` section or replace the previous managed section.

It must not initialize or upgrade CodeGraph, Serena, OpenSpec, Git, package dependencies, or hardware tooling. It must not create `.agent/planMsg.md`.

## Verify

1. Require `ok: true` in the JSON result.
2. Verify all three required project files exist.
3. If `AGENTS.md` was new, require at most 200 lines and all applicable sections defined in [agents-structure.md](references/agents-structure.md).
4. If `AGENTS.md` existed, confirm content outside the managed boundary remains unchanged.
5. Run the same initialization again and confirm the managed section is not duplicated and output is idempotent.
6. Confirm project profile and resource paths in `.agent/context.json` have filename, directory, or configuration evidence.
7. Confirm `Build and Verification` contains only the explicit compile/download authorization rule.
8. Confirm Code Analysis stays concise, OpenSpec paths are absent from `Project References`, broad Development, Specification, and Completion sections are absent, explicit invocation metadata is not repeated in `Project Context`, and `Handoff Context` uses index-first bounded reads.

Stop and report the exact validation failure instead of claiming initialization succeeded.
