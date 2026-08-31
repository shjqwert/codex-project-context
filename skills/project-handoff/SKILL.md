---
name: project-handoff
description: Create or revision-update an evidence-based current handoff for coherent work that continues in another Codex task or window, with optional milestone checkpoints and lightweight current-state retrieval. May be selected implicitly; do not trigger for routine questions, trivial edits, or mechanical shutdown.
---

# Project Handoff

Maintain one authoritative current Markdown document per coherent objective. Use current-task evidence, never reconstructed conversation guesses, and never bind handoff writes mechanically to `SessionEnd`.

## Decide Whether to Record

Create or update a work item when verified implementation, diagnosis, constraints, failed approaches, or incomplete verification would otherwise need rediscovery in another task. Skip routine questions, trivial edits, unsupported summaries, and accepted specifications with no continuation risk.

## Resolve Work Identity

Read the reliable current matches and compare their `sections.objective` with the present objective.

- One reliable objective match: update that explicit `workId`.
- No reliable objective match: create a new work item without `workId`.
- Multiple candidates or an unclear objective boundary: ask the user and do not write.
- A changed file, symbol, or title does not by itself create a new objective.
- A replacement objective creates a new work item. Mark the old item `superseded` first only when evidence confirms replacement.

Never let the CLI infer a mutable write target from `groupKey`, title similarity, or a broad module.

## Prepare Evidence

Read [handoff-format.md](references/handoff-format.md) completely. Read [examples.md](references/examples.md) when diagnosis, objective identity, checkpoint judgment, or migration behavior is uncertain.

When C4 state is part of the continuing objective, read [architecture-observations.md](references/architecture-observations.md). Record declarations and evidence freshness in existing sections; do not infer current pass from a model hash or historical approval alone.

Use Chinese by default for `title`, `summary`, and every prose section. Keep paths, symbols, IDs, test names, protocol terms, and other exact identifiers unchanged. Generate 2-6 concise retrieval aliases with at least one natural Chinese phrase and one natural English phrase. Aliases are search metadata and must not duplicate the title or summary.

Root-cause claims require evidence. When a cause remains uncertain, omit `sections.bugDiagnosis` and record only material uncertainty under `sections.risks`.

## Create or Update

1. Prepare one complete UTF-8 JSON value in memory with `title`, `summary`, `kind`, and the required `objective`, `currentState`, and `remainingWork` sections.
2. Add bounded routing metadata, bilingual aliases, supported optional sections, and one status: `active`, `blocked`, `completed`, or `superseded`.
3. For an update, read the current document first and include its explicit `workId` and `expectedRevision`. Submit a complete replacement state, not a patch or an automatic field merge.
4. Updating a `completed` or `superseded` item requires `reopen: true` and `status: "active"`.
5. Judge semantically whether the new state is a key milestone. When it is, add `checkpoint: true` and a concise `checkpointReason`. The reason is returned by the CLI but is not persisted in Markdown. Ordinary progress is not a checkpoint.
6. Resolve the plugin root as two directories above this `SKILL.md`, then run:

```text
node <plugin-root>/dist/cli/main.js handoff --project <absolute-project-root> --input -
```

Write JSON directly to standard input. Do not create an intermediate JSON file.

Equivalent normalized state returns `action: "deduplicated"` without advancing the revision. A stale `expectedRevision` returns a structured conflict and writes nothing. On conflict, reread current, reconstruct one complete version, and retry at most once when the evidence is non-conflicting; ask the user when states contradict.

## Add a Late Checkpoint

To preserve an unchanged current revision that was later recognized as a milestone, submit only:

```json
{
  "workId": "W001",
  "expectedRevision": 3,
  "checkpointOnly": true,
  "checkpointReason": "该版本形成了需要保留的关键决策。"
}
```

This does not advance the revision and deduplicates an existing checkpoint.

## Read History

Normal matching reads only current documents. Read history only for an explicit trace request, conflict diagnosis, or recovery:

```text
node <plugin-root>/dist/cli/main.js handoff-history --project <absolute-project-root> --work-id W001
node <plugin-root>/dist/cli/main.js handoff-history --project <absolute-project-root> --work-id W001 --revision 2
```

History never participates in global BM25 matching.

## Verify

1. Require a successful `created`, `updated`, `deduplicated`, or `checkpointed` action, or handle `conflict` without claiming a write.
2. Confirm the index entry has the expected `workId`, revision, status, current path, bilingual aliases, routing metadata, available sections, group key, and dedupe key.
3. Inspect a created or updated current Markdown file for accurate Chinese prose, exact identifiers, supported headings, and no empty or placeholder sections.
4. For a checkpoint, confirm the immutable full snapshot exists under `.agent/handoff/history/<cycle>/<workId>/R<revision>.md` and contains the post-update state.
5. Confirm passed tests only when their output was observed in the current task.
6. Keep current code, tests, accepted specifications, and the current handoff authoritative over history.

## Repair the Index

The schema v4 index is a rebuildable current-state cache. Valid current Markdown is authoritative. Access may repair a stale index under the project lock after an interrupted write. A corrupt current stops that work item's injection and update; never overwrite it automatically from history. A corrupt history snapshot does not block current matching.

Verify or explicitly rebuild with:

```text
node <plugin-root>/dist/cli/main.js handoff-index --project <absolute-project-root> --action verify
node <plugin-root>/dist/cli/main.js handoff-index --project <absolute-project-root> --action rebuild
```

Schema-v3 records remain read-only and are not moved or rewritten. The first explicit update lazily creates a schema-v4 current document; the oldest legacy ID becomes `workId`, other legacy IDs remain exact aliases, and legacy records map to chronological virtual revisions.
