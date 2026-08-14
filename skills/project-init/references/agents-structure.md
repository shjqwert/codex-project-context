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

Omit `Project References` when the analysis selects no non-OpenSpec references. Render category guidance only when the Agent submits it for selected resources. Do not generate `Development Rules`, `Specification Routing`, or `Completion Rules`.

Keep the `Project Context` and `Handoff Context` section roles stable, but render their content from actual project configuration and evidence. `Project Context` names only the context, plan, and handoff entry points that apply, plus exactly one `.agent/notebooklm-index.json` entry when NotebookLM is enabled. It must not expose component lists, source IDs, Hook behavior, Skill selection, schema internals, migration rules, or write-boundary implementation details.

`Handoff Context` combines four stable boundaries with up to three evidence-backed `handoffGuidance` lines: create records only for coherent cross-task continuation, read every reliably relevant record without a fixed count, do not force unrelated history when no reliable match exists, and keep current project evidence authoritative. Do not mention specifications, bug IDs, hardware, or other routing dimensions unless the analyzed project supports them.

Invocation policy:

- `project-init` and `project-sync` are explicit-only.
- `project-handoff` and `project-plan-msg` may be selected implicitly when their semantic admission rules are satisfied.
- `project-init` may create missing CodeGraph and Serena project indexes through the bounded preparation command; no Skill installs or upgrades optional tools.
