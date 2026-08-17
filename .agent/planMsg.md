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
      "status": "in-progress",
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
      "updatedAt": "2026-08-17T14:12:29.796Z",
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
        }
      ],
      "dedupeKey": "sha256:5e03b51927f49180a88880208348e299942984710b6fb5944ee76af21c455165"
    }
  ]
}
```
<!-- PROJECT_PLAN_DATA_END -->

## P001 Mutable current handoff with milestone history

- Status: `in-progress`
- Updated: 2026-08-17T14:12:29.796Z
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
