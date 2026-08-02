# Codex Project Context

`codex-project-context` is a local Codex plugin for durable project rules, project-level plans, and evidence-based handoffs across tasks. Version `0.3.5` is a functional-completeness candidate for local evaluation; it is not a public release.

## Capabilities

- Explicit `$codex-project-context:project-init` discovers bounded project evidence and creates or incrementally merges a complete managed `AGENTS.md` section.
- Explicit `$codex-project-context:project-sync` refreshes detected source, test, specification and reference paths, capabilities, managed guidance, and supported index migrations.
- Implicit-capable `$codex-project-context:project-handoff` records evidence for durable continuation and maintains a section-level schema v2 index.
- Implicit-capable `$codex-project-context:project-plan-msg` records qualifying project-level plans and validates their lifecycle transitions.
- `SessionStart` injects concise routing context only for initialized projects.
- `UserPromptSubmit` ranks and aggregates matching handoff cards under a bounded context budget.
- Equivalent handoff and plan inputs are idempotent under a project-local write lock.
- Chinese phrases and explicit previous-task cues can return bounded handoff candidates without opening records automatically.

The plugin does not require Git, MCP, OpenSpec, CodeGraph, or Serena. It detects optional tools but never initializes or upgrades them automatically.

## Generated Project Context

For a project without `AGENTS.md`, initialization generates a concise managed section of at most 200 lines with these sections:

1. Project Overview
2. Build and Verification (explicit compile/download authorization only)
3. Code Analysis
4. Project References, only when non-OpenSpec references are detected
5. Project Context
6. Handoff Context

`Code Analysis` contains only concise routing for CodeGraph, Serena, and normal-tool fallback. The generated file does not embed the official CodeGraph block, broad Development Rules, Specification Routing, Completion Rules, or duplicated explicit-invocation metadata. OpenSpec paths are omitted from `Project References`.

Existing `AGENTS.md` content is preserved; only the plugin-managed boundary is created or replaced. Discovery reads bounded filenames, manifests, configuration, and directory metadata. It does not collect package-manager or project build commands, and it does not load full manuals, schematics, or reference documents.

Initialization creates `.agent/context.json` and a schema v2 handoff index. New handoff records are stored under `.agent/handoff/records/<cycle>/`; older indexed paths remain readable. `.agent/planMsg.md` is created only when the first qualifying project-level plan is recorded.

## Development

```powershell
npm install
npm test
npm run package:local
```

The local package command creates `.local-marketplace/`. This repository marketplace is intended for local evaluation:

```powershell
codex plugin marketplace add .local-marketplace
codex plugin add codex-project-context@codex-project-context-dev
```

Hook changes may require review through `/hooks`. Skill metadata makes initialization and synchronization explicit-only while allowing semantic handoff and plan selection when their admission rules are satisfied.
Hook failures remain fail-open and append bounded diagnostics without prompt contents to `$CODEX_HOME/logs/project-context-hooks.jsonl`.

## CLI

```powershell
node dist/cli/main.js init --project D:\path\to\project
node dist/cli/main.js sync --project D:\path\to\project
node dist/cli/main.js status --project D:\path\to\project
node dist/cli/main.js match --project D:\path\to\project --prompt "continue W001"
node dist/cli/main.js plan --project D:\path\to\project --action list
```

`handoff` and plan creation accept UTF-8 JSON from a file or standard input. See the bundled Skill references for admission criteria, supported fields, evidence rules, and state transitions.
