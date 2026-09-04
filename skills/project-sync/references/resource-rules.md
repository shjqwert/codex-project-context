# Synchronization and Resource Rules

Synchronization is explicit and Agent-analyzed. Generate a fresh bounded inventory, use available project tools to reassess only relevant evidence, and submit a validated analysis carrying the current inventory fingerprint.

Allowed updates:

- detected profile, capabilities, inventory fingerprint, Agent analysis, evidence paths, references, and advisories in `.agent/context.json`;
- plugin-managed `AGENTS.md` content;
- creation of a missing empty schema v4 handoff index only when no handoff storage exists; synchronization never rewrites current, history, or schema-v3 Markdown records.

Forbidden updates:

- user-authored `AGENTS.md` content;
- handoff current, history, and legacy Markdown records;
- `.agent/planMsg.md`;
- optional tool installation or configuration;
- dependency installation, source changes, or Git state.

Preserve analysis lines while their evidence remains valid. Remove or revise a line when its cited evidence disappears or conflicts with current evidence. A generic PDF is documentation, not automatically a manual. Never classify OpenSpec-owned `specs` paths as tests or render OpenSpec-owned paths in `Project References`.

For architecture resources, keep responsibilities separate:

- `architecture/baseline.md` or `architecture/<domain>/baseline.md` records architecture intent and long-lived constraints. Synchronize it as a confirmed current reference only when `baselineStatus` is `confirmed` and current evidence does not make its relevant locators or claims stale.
- Root single-domain layout uses `architecture/model.c4` and `architecture/changes/`; multi-domain layout uses the `model.c4` and `changes/` adjacent to `architecture/<domain>/baseline.md`. The formal model records current structural facts, corroborated by code or configuration.
- The mapped `changes/` records proposed or active change evidence, not current project fact while a change is proposed, approved but not implemented, partial, failed, or blocked.

An implemented change may describe implementation state and visible residual risk, but only an applicable verification pass and migration into the formal As-Is support a verified-current claim. Project synchronization may update resource routing and advisories, but never edits, confirms, or silently refreshes an Architecture Baseline. A new, moved, or newly confirmed baseline creates a required explicit synchronization action; until the user runs project-sync, generated Project Context must be described as stale and the pending action remains visible in the current handoff. Ignore root or nested `.generated/` output and conventional reproducible views misplaced under `architecture/`, including `site/`, `png/`, `layouts/`, HTML, SVG, PNG, and layout JSON.

Do not infer project stage, create tasks or plans, download missing references, or fabricate external facts. Return relevant missing inputs as advisories. Repeated synchronization with the same inventory and analysis must be byte-identical.

RAG owns document knowledge, source inventory, unchanged-source reuse and manual matching. For a selected schematic added or changed since initialization, explicit sync may invoke the existing RAG project-schematic workflow described in the shared Hardware reference. Persist only the original resource entry and concise use principle in Project Context; no missing-schematic placeholders, parsed components, source IDs or duplicate processing state.

Preserve valid `.agent/authorizations.json` bytes. A missing file means inherited Sol Advisor eligibility after the new integration marker exists. The only synchronization write allowed to this file is the one-time legacy migration from a previously disabled, marker-free project to explicit `implicitDelegation: false`.

Accept schema-v3 handoff indexes as read-only compatibility input and schema v4 as current format. Reject other schemas. Synchronization must not migrate or rewrite handoff formats.
