# Managed AGENTS Structure

For a project without `AGENTS.md`, generate a concise file containing at most 200 lines. There is no minimum line count; do not pad the file with generic rules. For an existing file, preserve user content and replace only the plugin-managed boundary.

Required sections:

1. Project Overview
2. Build and Verification
3. Code Analysis
4. Project References, only when non-OpenSpec project references are detected
5. Project Context
6. Handoff Context

The generated file must distinguish detected facts from unconfirmed information. It must explain when references are read, how verification claims are supported, and how project context is routed without embedding task progress.

`Build and Verification` contains one rule only: do not compile, build, download, flash, or program the target without an explicit user request. Do not list detected or missing package managers and project commands.

Keep `Code Analysis` to three concise routing statements: CodeGraph for relationship analysis, Serena for symbol-oriented analysis and modification, and normal project tools as the fallback. Do not embed the official CodeGraph managed block.

Omit OpenSpec-owned paths from `Project References`. Do not generate `Development Rules`, `Specification Routing`, or `Completion Rules`; those broad instructions unnecessarily constrain the active model or duplicate global or plugin-level behavior. Merge only runtime-relevant Skill and Hook routing into `Project Context`, and do not repeat the explicit invocation policy for `project-init` or `project-sync` there. Use `Handoff Context` for index-first, bounded record loading.

Invocation policy:

- `project-init` and `project-sync` are explicit-only.
- `project-handoff` and `project-plan-msg` may be selected implicitly when their semantic admission rules are satisfied.
- No Skill may initialize or upgrade optional tools unless separately requested.
