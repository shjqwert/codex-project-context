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

For LikeC4, synchronize confirmed current architecture from the formal As-Is model and corroborating code or configuration. Do not turn `architecture/<domain>/changes/` into current project facts while a change is proposed, approved but not implemented, partial, failed, or blocked. An implemented change may describe implementation state and visible residual risk, but only an applicable verification pass and migration into the formal As-Is support a verified-current claim. Ignore `.generated/` HTML, PNG, layout, and other reproducible output.

Do not infer project stage, create tasks or plans, download missing references, or fabricate external facts. Return relevant missing inputs as advisories. Repeated synchronization with the same inventory and analysis must be byte-identical.

Experimental document-retrieval state, source inventory, and standalone PDF library upload are outside project-sync.

Preserve valid `.agent/authorizations.json` bytes. A missing file means inherited Sol Advisor eligibility after the new integration marker exists. The only synchronization write allowed to this file is the one-time legacy migration from a previously disabled, marker-free project to explicit `implicitDelegation: false`.

Accept schema-v3 handoff indexes as read-only compatibility input and schema v4 as current format. Reject other schemas. Synchronization must not migrate or rewrite handoff formats.
