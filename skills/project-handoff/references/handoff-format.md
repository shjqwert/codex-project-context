# Handoff Format

## Work Identity

One coherent objective owns one stable `workId`. Files, symbols, titles, and routing metadata may change without changing the work identity. When the core outcome and acceptance boundary change, create a new work item. Broad module overlap and lexical similarity are never sufficient authority to overwrite current state.

## Create and Update Input

Required prose fields:

- `title`
- `summary`
- `kind`: `feature`, `bug`, `investigation`, `maintenance`, or `verification`
- `sections.objective`
- `sections.currentState`
- `sections.remainingWork`

Use Chinese by default for prose. Keep exact identifiers unchanged. Optional routing arrays are `specRefs`, `modules`, `symbols`, `files`, `bugIds`, `tests`, `tags`, and `aliases`. New Skill-authored input supplies 2-6 aliases with Chinese and English coverage.

Optional sections are `workCompleted`, `bugDiagnosis`, `decisionsAndConstraints`, `failedAttempts`, `verification`, `risks`, and `evidence`. Omit empty sections.

Updates additionally require `workId` and `expectedRevision`, and submit the complete next state. Status is one of `active`, `blocked`, `completed`, or `superseded`. Closed work requires `reopen: true` and `status: "active"` before content changes.

## Current and History

Current documents use schema version 2 and stable paths:

```text
.agent/handoff/current/<cycle>/<workId>-<initial-slug>.md
```

The path remains stable when a title changes. A current document contains `work_id`, `revision`, `status`, timestamps, dedupe and routing metadata, legacy IDs, available section keys, and Chinese section headings. It is the latest-state fact source.

When the Agent judges a key milestone, the complete post-update state is copied immutably to:

```text
.agent/handoff/history/<cycle>/<workId>/R<revision>.md
```

History is retained until an explicit future policy says otherwise. A late checkpoint can preserve an unchanged current revision without incrementing it. `checkpointReason` is returned by the CLI and is not persisted.

## Revision and Conflict Rules

- A real state change increments revision exactly once.
- Equivalent normalized state is idempotent and creates neither a revision nor a snapshot.
- Reordered routing arrays, Unicode width or case changes, and repeated whitespace do not create a revision.
- Aliases remain outside the dedupe key because they are derived retrieval hints.
- Every update supplies `expectedRevision`. A mismatch returns `conflict` and writes nothing.
- The project lock serializes writers; revision checking prevents a stale writer from overwriting a newer state.

## Evidence Rules

For work that includes C4 state, apply [architecture-observations.md](architecture-observations.md).
Keep source declarations, observed state and evidence freshness distinct using the existing
sections; no additional persistent schema or state store is introduced.

- Use project-relative paths.
- Record a passed test only after observing successful output.
- Keep hypotheses out of `bugDiagnosis`.
- Record constraints only from the user, current code, tests, specifications, logs, or project references.
- Make `remainingWork` concrete and current; remove obsolete risks and work rather than accumulating stale prose.

## Index and Recovery

The schema v4 index has one entry per work item and stores only current routing metadata. It does not copy section bodies or BM25 term statistics. Current Markdown rebuilds the cache. History corruption is isolated; current corruption blocks only the affected work and is never silently replaced.

Schema-v3 immutable records remain readable. Records sharing a reliable legacy group become chronological virtual revisions, the oldest ID becomes the stable work ID, and later IDs remain exact retrieval aliases. Reading never migrates them. An explicit update materializes the first v4 current document.

## Retrieval

Exact work IDs, legacy IDs, specification IDs, bug IDs, full paths, symbols, and explicit modules rank above BM25. BM25 uses only current index `title`, `summary`, modules, tags, tests, and bilingual aliases. Active and blocked current work ranks ahead of completed and superseded work for natural-language ties. Exact routing is status-independent.

Default matching returns only each matched current document. History requires a known `workId` and an explicit history query.

Matches marked `candidate` are ambiguous, not authorization to load every candidate
body. Compare metadata with the current objective first; use `match --explain` for
complete reasons. An unmatched concrete topic must not become an unrelated recent task.
