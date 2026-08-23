# Project Plans

> Managed project-level plans only. Routine bugs, implementation tasks, and development journals do not belong here.

<!-- PROJECT_PLAN_DATA_START -->
```json
{
  "schemaVersion": 1,
  "plans": [
    {
      "id": "P001",
      "title": "Mutable current handoff with milestone history",
      "summary": "Upgrade handoff storage to one stable work current document with revision-safe updates, selective immutable checkpoints, schema-v3 compatibility, Chinese-first Skill output, focused retrieval, review, release, and local Codex installation.",
      "status": "completed",
      "successCriteria": [
        "Stable workId current documents support create, update, dedupe, checkpoint, status, reopen, and revision conflicts.",
        "Legacy schema-v3 handoffs remain readable and migrate lazily without rewriting old records.",
        "Hooks and matching read current state by default, re-inject new revisions, and isolate history from global BM25.",
        "Focused, full, review, release, and installed-plugin verification pass.",
        "Detailed Chinese changelog is committed and pushed with the version update."
      ],
      "specRefs": [],
      "decisions": [
        "Current Markdown is authoritative; index is a rebuildable cache.",
        "History stores complete post-update milestone snapshots selected semantically by the Agent.",
        "Normal prose defaults to Chinese while identifiers remain exact and aliases remain bilingual.",
        "No transaction journal; valid current state repairs a stale index on access."
      ],
      "createdAt": "2026-08-17T14:12:29.640Z",
      "updatedAt": "2026-08-17T15:13:51.900Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-17T14:12:29.640Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "User confirmed the complete design baseline after the grilling decision tree.",
          "at": "2026-08-17T14:12:29.720Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "User explicitly authorized implementation, review, testing, repair, publication, and local Codex plugin update.",
          "at": "2026-08-17T14:12:29.796Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "Implementation committed and pushed at 5f5643a; TypeScript build and 74/74 tests passed; both Sol Advisor re-reviews passed; local package and installed enabled Codex plugin 1.2.0 with schema v4 and matching Skill hash were verified.",
          "at": "2026-08-17T15:13:51.900Z"
        }
      ],
      "dedupeKey": "sha256:5e03b51927f49180a88880208348e299942984710b6fb5944ee76af21c455165"
    },
    {
      "id": "P002",
      "title": "Remove NotebookLM integration",
      "summary": "Remove the retired NotebookLM MCP integration and every executable, schema, CLI, Skill, test, documentation, generated-package, and installed-cache surface while preserving core project-context behavior and historical changelog evidence.",
      "status": "completed",
      "successCriteria": [
        "No NotebookLM Skill, MCP dependency, CLI command, application module, public type, schema, current documentation, dedicated test, or packaged artifact remains.",
        "Legacy NotebookLM project or library data is never deleted automatically.",
        "Core initialization, synchronization, status, authorization, hooks, handoffs, matching, plans, and packaging tests pass after a clean build.",
        "The verified removal is committed and pushed to the current upstream branch."
      ],
      "specRefs": [],
      "decisions": [
        "Remove the legacy AGENTS.md NotebookLM scrubber together with the retired feature; a normal project sync rewrites the managed section.",
        "Keep existing CHANGELOG entries as historical evidence and add a new removal entry.",
        "Clean generated output before rebuilding so deleted TypeScript sources cannot survive as stale package files."
      ],
      "createdAt": "2026-08-23T14:09:06.339Z",
      "updatedAt": "2026-08-23T14:14:28.875Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-23T14:09:06.339Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "User approved the complete NotebookLM removal plan and requested execution.",
          "at": "2026-08-23T14:09:06.423Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "Implementation, verification, commit, and push have started.",
          "at": "2026-08-23T14:09:06.498Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "NotebookLM removal was committed and pushed at 6c6f9fa; clean TypeScript build and 68/68 tests passed; local package and installed enabled plugin 1.3.0 were verified without retired Skill, schema, module, or CLI surfaces.",
          "at": "2026-08-23T14:14:28.875Z"
        }
      ],
      "dedupeKey": "sha256:e7d1f41d8b5bb37bb3a4878302147241d15c20ba8fc2a0c93444f9763d25e309"
    }
  ]
}
```
<!-- PROJECT_PLAN_DATA_END -->

## P001 Mutable current handoff with milestone history

- Status: `completed`
- Updated: 2026-08-17T15:13:51.900Z
- OpenSpec references: none

Upgrade handoff storage to one stable work current document with revision-safe updates, selective immutable checkpoints, schema-v3 compatibility, Chinese-first Skill output, focused retrieval, review, release, and local Codex installation.

### Success Criteria

- Stable workId current documents support create, update, dedupe, checkpoint, status, reopen, and revision conflicts.
- Legacy schema-v3 handoffs remain readable and migrate lazily without rewriting old records.
- Hooks and matching read current state by default, re-inject new revisions, and isolate history from global BM25.
- Focused, full, review, release, and installed-plugin verification pass.
- Detailed Chinese changelog is committed and pushed with the version update.

### Decisions

- Current Markdown is authoritative; index is a rebuildable cache.
- History stores complete post-update milestone snapshots selected semantically by the Agent.
- Normal prose defaults to Chinese while identifiers remain exact and aliases remain bilingual.
- No transaction journal; valid current state repairs a stale index on access.

### Status History

- 2026-08-17T14:12:29.640Z: created -> proposed — Plan recorded.
- 2026-08-17T14:12:29.720Z: proposed -> accepted — User confirmed the complete design baseline after the grilling decision tree.
- 2026-08-17T14:12:29.796Z: accepted -> in-progress — User explicitly authorized implementation, review, testing, repair, publication, and local Codex plugin update.
- 2026-08-17T15:13:51.900Z: in-progress -> completed — Implementation committed and pushed at 5f5643a; TypeScript build and 74/74 tests passed; both Sol Advisor re-reviews passed; local package and installed enabled Codex plugin 1.2.0 with schema v4 and matching Skill hash were verified.

## P002 Remove NotebookLM integration

- Status: `completed`
- Updated: 2026-08-23T14:14:28.875Z
- OpenSpec references: none

Remove the retired NotebookLM MCP integration and every executable, schema, CLI, Skill, test, documentation, generated-package, and installed-cache surface while preserving core project-context behavior and historical changelog evidence.

### Success Criteria

- No NotebookLM Skill, MCP dependency, CLI command, application module, public type, schema, current documentation, dedicated test, or packaged artifact remains.
- Legacy NotebookLM project or library data is never deleted automatically.
- Core initialization, synchronization, status, authorization, hooks, handoffs, matching, plans, and packaging tests pass after a clean build.
- The verified removal is committed and pushed to the current upstream branch.

### Decisions

- Remove the legacy AGENTS.md NotebookLM scrubber together with the retired feature; a normal project sync rewrites the managed section.
- Keep existing CHANGELOG entries as historical evidence and add a new removal entry.
- Clean generated output before rebuilding so deleted TypeScript sources cannot survive as stale package files.

### Status History

- 2026-08-23T14:09:06.339Z: created -> proposed — Plan recorded.
- 2026-08-23T14:09:06.423Z: proposed -> accepted — User approved the complete NotebookLM removal plan and requested execution.
- 2026-08-23T14:09:06.498Z: accepted -> in-progress — Implementation, verification, commit, and push have started.
- 2026-08-23T14:14:28.875Z: in-progress -> completed — NotebookLM removal was committed and pushed at 6c6f9fa; clean TypeScript build and 68/68 tests passed; local package and installed enabled plugin 1.3.0 were verified without retired Skill, schema, module, or CLI surfaces.
