# Synchronization and Resource Rules

Synchronization is explicit and Agent-analyzed. Generate a fresh bounded inventory, use available project tools to reassess only relevant evidence, and submit a validated analysis carrying the current inventory fingerprint.

Allowed updates:

- detected profile, capabilities, inventory fingerprint, Agent analysis, evidence paths, references, and advisories in `.agent/context.json`;
- plugin-managed `AGENTS.md` content;
- validated NotebookLM bindings only through the dedicated NotebookLM index command and only for an explicit operation or changed selected schematic hash;
- creation of a missing empty schema v3 handoff index only when no records exist; synchronization never rewrites Markdown records.

Forbidden updates:

- user-authored `AGENTS.md` content;
- handoff Markdown records;
- `.agent/planMsg.md`;
- optional tool installation or configuration;
- dependency installation, source changes, or Git state.

Preserve analysis lines while their evidence remains valid. Remove or revise a line when its cited evidence disappears or conflicts with current evidence. A generic PDF is documentation, not automatically a manual. Never classify OpenSpec-owned `specs` paths as tests or render OpenSpec-owned paths in `Project References`.

Do not infer project stage, create tasks or plans, download missing references, or fabricate external facts. Return relevant missing inputs as advisories. Repeated synchronization with the same inventory and analysis must be byte-identical.

NotebookLM source inventory has no TTL and is never refreshed by ordinary synchronization. Project/public corpus scope and document category are separate. Standalone PDF library upload is outside project-sync.

Reject unsupported handoff index schemas. Do not migrate or rewrite earlier handoff formats.
