# Managed AGENTS Structure

For a project without `AGENTS.md`, generate a concise file containing at most 200 lines. There is no minimum line count; do not pad the file with generic rules. For an existing file, preserve user content and replace only the plugin-managed boundary.

Required sections:

1. Project Overview
2. Build and Verification
3. Code Analysis
4. Project References, only when non-OpenSpec project references are detected
5. Project Context
6. Sol Advisor Integration
7. Handoff Context

The project-specific content is authored from the validated Agent analysis; it is not selected from project-type templates. The CLI owns only section formatting, context-routing invariants, evidence validation, managed-boundary preservation, and the 200-line limit.

`Project Overview` renders only the submitted evidence-backed facts. Do not render specification-directory metadata or generic interpretation advice. Embedded-only facts such as target, toolchain, and debugger appear only when supported by repository evidence.

`Build and Verification` renders one to three concise evidence-backed build/test entry points and relevant project-specific restrictions. Do not infer successful execution or list unconfirmed commands; do not repeat an exhaustive global policy.

Keep `Code Analysis` concise and evidence-based. Mention CodeGraph or Serena only according to current capability evidence, and retain normal project tools as a non-blocking fallback. Do not embed the official CodeGraph managed block.

Omit `Project References` when the analysis selects no non-OpenSpec references. Render category guidance only when the Agent submits it for selected resources. Do not generate `Development Rules`, `Specification Routing`, or `Completion Rules`.

When a selected resource is the canonical `architecture/baseline.md` or `architecture/<domain>/baseline.md`, preserve its dedicated Architecture Baseline purpose. Do not describe a `pending-confirmation`, stale, conflicting, or unreadable baseline as confirmed current architecture; report that limitation in the Agent-authored analysis instead.

Keep the `Project Context` and `Handoff Context` section roles stable, with the context, Plan, Handoff and existing native OpenSpec entry points that apply. Keep resource entries and a concise RAG use principle in Project References when supported. Do not expose component lists, source IDs, Hook internals, schema/migration details or role contracts.

Keep `Sol Advisor Integration` minimal: state the effective project policy (`inherit`, explicit allow, or explicit deny), the three-state authorization semantics, fail-closed invalid-state behavior, and ownership boundary. Eligibility never requires delegation. Unavailable or quota-limited routes return ownership to the primary after existing work is checked. Route details, role prompts, model selection, and result protocols remain in the Sol Advisor Skill rather than the project file.

`Handoff Context` combines stable boundaries with up to three evidence-backed `handoffGuidance` lines: create records only for coherent cross-task continuation, inspect relevant summaries first and load only needed current sections without a fixed match-count cap, do not force unrelated history, and keep current evidence authoritative. Mention only routing dimensions supported by the project.

Invocation policy:

- `project-init` and `project-sync` are explicit-only.
- `project-handoff` and `project-plan-msg` may be selected implicitly when their semantic admission rules are satisfied.
- `project-init` may create missing CodeGraph and Serena project indexes through the bounded preparation command; no Skill installs or upgrades optional tools.
