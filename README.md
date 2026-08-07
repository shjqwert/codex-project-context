# Codex Project Context

`codex-project-context` is a local Codex plugin for durable project rules, project-level plans, and evidence-based handoffs across tasks. Version `0.4.0` is a functional-completeness candidate for local evaluation; it is not a public release.

## Capabilities

- Explicit `$codex-project-context:project-init` inventories the confirmed repository, directs the Agent to analyze it with available CodeGraph, Serena, configuration, code, and documentation evidence, then validates and persists an Agent-authored managed `AGENTS.md` section.
- Explicit `$codex-project-context:project-sync` repeats the evidence-backed Agent analysis for an initialized project and synchronizes only supported managed context.
- Implicit-capable `$codex-project-context:project-handoff` records evidence for durable continuation and maintains a lightweight schema v3 relevance index.
- Implicit-capable `$codex-project-context:project-plan-msg` records qualifying project-level plans and validates their lifecycle transitions.
- `SessionStart` injects concise routing context only for initialized projects.
- `UserPromptSubmit` merges deterministic ID/path/symbol/module routing with a dependency-free TypeScript BM25 ranker over lightweight title, summary, module, tag, test, and bilingual alias fields. It reports when bounded routing output is truncated. Within one task, an unchanged match set is injected only once; a new group or record is injected again, and `clear`/`compact` resets that task-local suppression state.
- Equivalent handoff and plan inputs are idempotent under a project-local write lock.
- Evidence-based bilingual aliases let Chinese phrases retrieve English handoffs without duplicating translated titles, summaries, or bodies; an explicit previous-task cue returns the complete most recent coherent group without opening records automatically.

The plugin does not require Git, MCP, OpenSpec, CodeGraph, or Serena. It detects optional tools but never initializes or upgrades them automatically.

## Generated Project Context

For a project without `AGENTS.md`, initialization generates a concise managed section of at most 200 lines with these sections:

1. Project Overview
2. Build and Verification (Agent-authored, project-relevant authorization only)
3. Code Analysis
4. Project References, only when non-OpenSpec references are detected
5. Project Context
6. Handoff Context

`Code Analysis` contains concise Agent-authored routing based on available CodeGraph, Serena, and normal project tools. The generated file does not embed the official CodeGraph block, broad Development Rules, Specification Routing, Completion Rules, or duplicated explicit-invocation metadata. OpenSpec paths are omitted from `Project References`.

`Project Context` contains only the context, plan, and handoff entry points that apply. `Handoff Context` keeps stable relevance and evidence boundaries while using up to three project-specific, evidence-backed routing lines; it does not use a project-type template or expose Hook and schema internals.

Existing `AGENTS.md` content is preserved; only the plugin-managed boundary is created or replaced. The CLI separates inventory from judgment: `inspect` returns a bounded repository inventory and fingerprint, while `init` and `sync` require a schemaVersion 1 Agent analysis whose facts and rules cite current project-relative evidence. The CLI validates paths, freshness, managed boundaries, and the 200-line limit. It does not infer project stage, create tasks, download missing references, or load full manuals and schematics.

Initialization creates `.agent/context.json` and a schema v3 handoff index. New immutable Markdown records are stored under `.agent/handoff/records/<cycle>/` and contain the metadata needed to rebuild a missing index. Unsupported earlier handoff index schemas are rejected rather than migrated. `.agent/planMsg.md` is created only when the first qualifying project-level plan is recorded.

Handoff matching builds an in-memory BM25 corpus from schema v3 index entries on each query; it never stores term frequencies or reads Markdown bodies during normal indexed matching. Exact IDs, specification IDs, bug IDs, full paths, symbols, and explicit modules always rank above lexical results. Optional aliases are bounded bilingual retrieval phrases generated from task evidence, are excluded from handoff identity, and are never rendered as translated body content or complete Hook metadata. BM25 requires at least two useful terms, minimum term coverage and score quality, and returns close reliable leaders together instead of selecting an arbitrary record.

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

## Install on Another Computer

The repository intentionally excludes generated `dist/` and `.local-marketplace/` directories. On a new Windows computer, clone the repository and build the local package before adding the plugin:

```powershell
git clone https://github.com/shjqwert/codex-project-context.git
cd codex-project-context

npm ci
npm test
npm run package:local

codex plugin marketplace add .local-marketplace
codex plugin add codex-project-context@codex-project-context-dev
```

Install Node.js 20 or later and the Codex CLI first. Hook trust is local to each computer: review and trust the two plugin Hooks through `/hooks` after the first installation. Once trusted, normal use does not require a confirmation on every prompt.

Hook changes may require review through `/hooks`. Skill metadata makes initialization and synchronization explicit-only while allowing semantic handoff and plan selection when their admission rules are satisfied.
Hook failures remain fail-open and append bounded diagnostics without prompt contents to `$CODEX_HOME/logs/project-context-hooks.jsonl`. Prompt injection deduplication stores only SHA-256 markers under `$CODEX_HOME/state/project-context-hooks/prompt-injections`; prompt text is not persisted.

## CLI

```powershell
node dist/cli/main.js inspect --project D:\path\to\project
$analysisJson | node dist/cli/main.js init --project D:\path\to\project --input -
$analysisJson | node dist/cli/main.js sync --project D:\path\to\project --input -
node dist/cli/main.js status --project D:\path\to\project
node dist/cli/main.js match --project D:\path\to\project --prompt "continue W001"
node dist/cli/main.js handoff-index --project D:\path\to\project --action verify
node dist/cli/main.js handoff-index --project D:\path\to\project --action rebuild
node dist/cli/main.js plan --project D:\path\to\project --action list
```

Initialization, synchronization, handoff creation, and plan creation accept UTF-8 JSON from a file or standard input. The bundled Skills write generated JSON directly to standard input so they do not create intermediate files. See the bundled Skill references for admission criteria, supported fields, evidence rules, and state transitions.
The handoff index commands verify or rebuild the schema v3 cache from immutable Markdown records. Rebuild rejects section metadata that does not exactly match the rendered Markdown body.
