# Managed AGENTS Structure

For a project without `AGENTS.md`, generate a concise file containing at most 200 lines. There is no minimum line count; do not pad the file with generic rules. For an existing file, preserve user content and replace only the plugin-managed boundary.

Required sections:

1. Project Overview
2. Build and Verification
3. Code Analysis
4. Project References, only when non-OpenSpec project references are detected
5. Project Context
6. Handoff Context

The project-specific content is authored from the validated Agent analysis; it is not selected from project-type templates. The CLI owns only section formatting, context-routing invariants, evidence validation, managed-boundary preservation, and the 200-line limit.

`Project Overview` renders only the submitted evidence-backed facts. Do not render specification-directory metadata or generic interpretation advice. Embedded-only facts such as target, toolchain, and debugger appear only when supported by repository evidence.

`Build and Verification` renders one to three Agent-authored authorization rules relevant to the repository. Do not list detected or missing package managers and project commands.

Keep `Code Analysis` concise and evidence-based. Mention CodeGraph or Serena only according to current capability evidence, and retain normal project tools as a non-blocking fallback. Do not embed the official CodeGraph managed block.

Omit `Project References` when the analysis selects no non-OpenSpec references. Render category guidance only when the Agent submits it for selected resources. Do not generate `Development Rules`, `Specification Routing`, or `Completion Rules`. Keep the plugin's storage and Hook invariants in `Project Context`; combine the Agent's project-specific handoff subjects with the fixed index-first bounded-read contract in `Handoff Context`.

Invocation policy:

- `project-init` and `project-sync` are explicit-only.
- `project-handoff` and `project-plan-msg` may be selected implicitly when their semantic admission rules are satisfied.
- No Skill may initialize or upgrade optional tools unless separately requested.
