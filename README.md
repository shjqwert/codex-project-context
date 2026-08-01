# Codex Project Context

`codex-project-context` is a local Codex plugin for keeping project rules, project-level plans, and evidence-based handoffs usable across tasks. Version `0.2.0` provides four skills, two lifecycle hooks, and a deterministic local CLI. It does not require Git, MCP, OpenSpec, CodeGraph, or Serena.

## First-version capabilities

- `$codex-project-context:project-init` initializes `AGENTS.md`, `.agent/context.json`, and the handoff index without replacing user-authored `AGENTS.md` content.
- `$codex-project-context:project-sync` refreshes detected project capabilities and the plugin-managed `AGENTS.md` section.
- `$codex-project-context:project-handoff` records a structured handoff and updates its index.
- `$codex-project-context:project-plan-msg` records key project plans and validates their status transitions without creating an empty plan file during initialization.
- `SessionStart` injects a short routing note when the current directory belongs to an initialized project.
- `UserPromptSubmit` ranks and aggregates matching handoff cards under a bounded context budget; it does not inject full handoff files.
- The handoff index stores short section summaries and migrates schema v1 indexes to schema v2 during initialization or synchronization.

## Development

```powershell
npm install
npm test
npm run package:local
```

The local package command creates `.local-marketplace/`, which can be connected with:

```powershell
codex plugin marketplace add .local-marketplace
codex plugin add codex-project-context@codex-project-context-dev
```

Plugin hooks are intentionally untrusted after installation. Review them with `/hooks` in a new Codex task before normal use.

## CLI smoke checks

```powershell
node dist/cli/main.js init --project D:\path\to\project
node dist/cli/main.js status --project D:\path\to\project
node dist/cli/main.js match --project D:\path\to\project --prompt "continue W001"
node dist/cli/main.js plan --project D:\path\to\project --action list
```

`handoff` accepts a JSON file:

```json
{
  "title": "Session cleanup",
  "summary": "Preserved the existing error envelope and added focused tests.",
  "modules": ["session"],
  "files": ["src/session.ts"],
  "symbols": ["stopSession"],
  "tests": ["session cleanup"]
}
```

```powershell
node dist/cli/main.js handoff --project D:\path\to\project --input handoff.json
```

`plan --action create` accepts a JSON file with `title`, `summary`, and optional `successCriteria`, `specRefs`, and `decisions`. New plans start as `proposed`; use `plan --action transition` with an evidence-based reason to move through the validated state machine.
