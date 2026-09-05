# Codex Project Context

`codex-project-context` is a Codex plugin for durable project rules, long-term plans and cross-task handoffs. Release `1.7.0` adds layered discovery, evidence-backed build entries, RAG schematic routing, native OpenSpec Change associations, and deduplication of emitted Hook cards. The TypeScript build and full 91-test suite pass; candidate installation and independent Codex client loading also pass.

## Capabilities

- Explicit `$codex-project-context:project-init` creates missing CodeGraph and Serena project indexes through their already-installed CLIs, inventories the confirmed repository, directs the Agent to analyze current evidence, then validates and persists an Agent-authored managed `AGENTS.md` section. When callable, Context7 may clarify repository-supported developer dependencies; an available local reader may inspect an exact, selected, bounded document without bulk conversion.
- Explicit `$codex-project-context:project-sync` repeats the same evidence-backed, bounded analysis for an initialized project and synchronizes only supported managed context.
- New projects inherit global Sol Advisor eligibility by default without creating a redundant authorization file. Project policy may explicitly allow (`true`) or disable (`false`) implicit delegation in `.agent/authorizations.json`; the CLI can later restore inherited behavior without changing durable project context.
- Implicit-capable `$codex-project-context:project-handoff` creates or revision-updates one authoritative current document per objective, with optional immutable milestone checkpoints and a lightweight schema v5 relevance index.
- Implicit-capable `$codex-project-context:project-plan-msg` records qualifying project-level plans and validates their lifecycle transitions.
- `SessionStart` injects concise routing context only for initialized projects.
- `UserPromptSubmit` merges deterministic ID/path/symbol/module routing with a dependency-free TypeScript BM25 ranker over current title, summary, module, tag, test, and bilingual alias fields. It reports truncation, injects only current documents, and uses `workId + revision` so a changed revision is injected again while unchanged state remains suppressed.
- Equivalent handoff and plan inputs are idempotent under a project-local write lock. Immutable owner generations prevent elapsed time from displacing a live or indeterminate writer; a confirmed exited local owner can be followed by a new generation, and release marks only the generation acquired by that writer.
- Skill-authored handoff prose defaults to Chinese while exact identifiers remain unchanged and bounded bilingual aliases preserve English retrieval. An explicit previous-task cue returns the most recent active or blocked current work before closed work.

Core project context does not require Git, MCP, OpenSpec, CodeGraph, Serena, Context7, or a particular document converter. During project initialization the plugin may create missing CodeGraph and Serena project indexes when their CLIs are already installed, but it never installs or upgrades optional tools. CodeGraph and Serena perform normal incremental maintenance themselves after the first index; the plugin does not bind refresh work to synchronization or Hooks. Session-local documentation tools are not persisted as project capabilities.

Retrieval preserves full query-topic coverage instead of discarding unknown topic terms. Explicit exclusions apply to identifier and lexical routing; a concrete unmatched continuation topic no longer falls back to unrelated recent work. Results include `disposition: reliable | candidate`: ambiguous candidates require metadata review before body reads. `match --explain` reports complete read-only evidence and rejection diagnostics; it cannot be combined with `--limit`. Scores and coverage are retrieval evidence, not semantic probabilities.

C4 state remains four separate declarations owned by the architecture workflow. Canonical `architecture/baseline.md` and `architecture/<domain>/baseline.md` resources are discovered as documentation with dedicated routing for architecture intent, module boundaries, ownership and dependency constraints; file presence alone does not make a baseline confirmed or current. A qualifying handoff records baseline, model, implementation and verification observations with separate evidence freshness. Reusing pass requires unchanged applicable baseline, model, implementation/configuration, build/firmware and test/result identities; a hash or report path alone is insufficient. See [architecture observations](skills/project-handoff/references/architecture-observations.md). No new schema type, state database, automatic model scan or knowledge-service integration is introduced.

## Generated Project Context

For a project without `AGENTS.md`, initialization generates a concise managed section of at most 200 lines with these sections:

1. Project Overview
2. Build and Verification (Agent-authored, project-relevant authorization only)
3. Code Analysis
4. Project References, only when non-OpenSpec references are detected
5. Project Context
6. Sol Advisor Integration
7. Handoff Context

`Code Analysis` contains concise Agent-authored routing based on available CodeGraph, Serena, and normal project tools. The generated file does not embed the official CodeGraph block, broad Development Rules, Specification Routing, Completion Rules, or duplicated explicit-invocation metadata. OpenSpec paths are omitted from `Project References`. A selected canonical Architecture Baseline keeps its dedicated read-before-change purpose; pending, stale, or conflicting baselines remain proposals or advisories rather than current facts.

`Project Context` contains the context, Plan, Handoff and existing native OpenSpec entry points. RAG retains knowledge and source state; project references retain only paths and a compact retrieval principle. `Handoff Context` restores relevant summaries before loading the sections needed by the current task.

Existing `AGENTS.md` content is preserved; only the plugin-managed boundary is created or replaced. The CLI separates inventory from judgment: `inspect` returns a bounded repository inventory and fingerprint, while `init` and `sync` require a schemaVersion 1 Agent analysis whose facts and rules cite current project-relative evidence. The CLI validates paths, freshness, managed boundaries, and the 200-line limit. It does not infer project stage, create tasks, download missing references, or load full manuals and schematics.

Initialization creates `.agent/context.json` and a schema v5 handoff index. New current documents are stored under `.agent/handoff/current/<cycle>/`; selected full checkpoints use `.agent/handoff/history/<cycle>/<workId>/R<revision>.md`. Schema-v3 records under `.agent/handoff/records/<cycle>/` remain read-only and become chronological virtual revisions until the first explicit update lazily creates current state. `.agent/planMsg.md` is created only when the first qualifying project-level plan is recorded. Plan queries aggregate native OpenSpec Change associations and return a located warning when a Change references a plan that does not exist; they never rewrite the Change while reporting that condition.

Readers also accept schema-v4 current indexes, including association fields emitted by the earlier 1.7.0 development branch. A valid read does not rewrite the index just to upgrade it; actual updates and explicit rebuilds write v5 while preserving untouched Markdown/history. Older 1.6.0 clients cannot read v5 indexes.

Project-level Sol Advisor policy has three states: a missing file/key inherits the global default, `true` explicitly allows, and `false` disables implicit delegation. Invalid or unreadable policy fails closed. `enable`, `disable`, and `inherit` select those states; the legacy `remove` action remains a compatibility alias for `disable` so an old off command cannot accidentally enable delegation under the new default. On the first explicit sync of a legacy initialized project with no authorization and no new integration marker, the plugin writes `false` to preserve its previous disabled behavior. Neither workflow requires Sol Advisor to be installed.

This plugin is the only component that writes the project-managed `AGENTS.md` section, `.agent/context.json`, `.agent/authorizations.json`, `.agent/planMsg.md`, and `.agent/handoff/`. It never writes the user-level `~/.codex/AGENTS.md`. Sol Advisor may read project policy and context but does not modify these files.

Handoff matching builds an in-memory BM25 corpus from schema v5 current entries on each query; it never stores term frequencies, searches history globally, or reads Markdown bodies during normal indexed matching. Exact current and legacy IDs, specification IDs, bug IDs, full paths, symbols, and explicit modules rank above lexical results. Optional aliases are bounded bilingual retrieval phrases excluded from state identity and complete Hook metadata. Natural-language ties prioritize active and blocked work over completed and superseded work.

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

### Optional Embedded Architecture Review Setup

The companion embedded Skills are maintained in [embedded_skills](https://github.com/shjqwert/embedded_skills). On the new computer, use `$skill-installer` to install the required Skill directories from that repository into the user Skill scope.

LikeC4 itself is not bundled with this plugin. Install its CLI and register its official MCP server separately on each computer:

```powershell
npm install --global likec4
codex mcp add likec4 -- npx -y @likec4/mcp
npx skills add https://likec4.dev/

codex mcp list
likec4 --version
```

Restart Codex after registering the MCP server. Keep authoritative `.c4` or `.likec4` architecture sources in each target project and commit them with that project; rendered sites and images remain regenerable outputs.

Hook changes may require review through `/hooks`. Skill metadata makes initialization and synchronization explicit-only while allowing semantic handoff and plan selection when their admission rules are satisfied.
Hook failures remain fail-open and append bounded diagnostics without prompt contents to `$CODEX_HOME/logs/project-context-hooks.jsonl`. Session/project output reservations and SHA-256 card markers live under `$CODEX_HOME/state/project-context-hooks/prompt-injections`; only generation/release markers and owner process IDs are added, never prompt text. The complete output budget comes from `hooks/hooks.json`. Reservation metadata is published with an atomic hard link, so the state filesystem must support hard links; failures produce diagnostics instead of unsafe concurrent output. Active owners are not displaced; exited owners can be followed by a new generation. Published generations remain until the existing clear/compact session reset, preventing competing recovery attempts from reusing a reservation. A crash after stdout succeeds but before card markers are written may resend cards. Without a session ID, output remains available without cross-call deduplication.

## CLI

```powershell
node dist/cli/main.js prepare-indexes --project D:\path\to\project
node dist/cli/main.js inspect --project D:\path\to\project
$analysisJson | node dist/cli/main.js init --project D:\path\to\project --input -
$analysisJson | node dist/cli/main.js init --project D:\path\to\project --input - --no-sol-advisor-implicit-delegation
$analysisJson | node dist/cli/main.js sync --project D:\path\to\project --input -
node dist/cli/main.js status --project D:\path\to\project
node dist/cli/main.js authorization --project D:\path\to\project --sol-advisor-implicit-delegation enable
node dist/cli/main.js authorization --project D:\path\to\project --sol-advisor-implicit-delegation disable
node dist/cli/main.js authorization --project D:\path\to\project --sol-advisor-implicit-delegation inherit
node dist/cli/main.js authorization --project D:\path\to\project --sol-advisor-implicit-delegation remove
node dist/cli/main.js match --project D:\path\to\project --prompt "continue W001"
$handoffJson | node dist/cli/main.js handoff --project D:\path\to\project --input -
node dist/cli/main.js handoff-history --project D:\path\to\project --work-id W001
node dist/cli/main.js handoff-history --project D:\path\to\project --work-id W001 --revision 2
node dist/cli/main.js handoff-index --project D:\path\to\project --action verify
node dist/cli/main.js handoff-index --project D:\path\to\project --action rebuild
node dist/cli/main.js plan --project D:\path\to\project --action list
```

`prepare-indexes` creates only missing CodeGraph and Serena project indexes and reports unavailable or failed tools without installing or upgrading them. Initialization, synchronization, handoff creation, and plan creation accept UTF-8 JSON from a file or standard input. The bundled Skills write generated JSON directly to standard input so they do not create intermediate files. See the bundled Skill references for admission criteria, supported fields, evidence rules, and state transitions.
The handoff index commands verify or rebuild the schema v5 current-state cache. Rebuild rejects invalid current metadata and headings, isolates corrupt history from normal current matching, and preserves all schema-v3 records unchanged.
