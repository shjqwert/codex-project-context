# Synchronization and Resource Rules

Synchronization is explicit and deterministic. Rescan bounded project metadata using the same classifications as initialization.

Allowed updates:

- detected profile, capabilities, specification directories, and resource paths in `.agent/context.json`;
- plugin-managed `AGENTS.md` content;
- missing or supported handoff index schema migration.

Forbidden updates:

- user-authored `AGENTS.md` content;
- handoff Markdown records;
- `.agent/planMsg.md`;
- optional tool installation or configuration;
- dependency installation, source changes, or Git state.

When a resource disappears, remove only its generated routing entry. Never classify OpenSpec-owned `specs` paths as tests and never render OpenSpec-owned paths in `Project References`. Repeated synchronization without project changes must be byte-identical.
