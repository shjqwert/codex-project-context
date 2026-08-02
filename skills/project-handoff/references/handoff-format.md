# Handoff Format

## Required Input

- `title`: concise identity of the coherent work.
- `summary`: evidence-based current state useful to another task.
- `kind`: one of `feature`, `bug`, `investigation`, `maintenance`, or `verification`.
- `sections.objective`: the specific continuation goal.
- `sections.currentState`: the confirmed state at handoff time.
- `sections.remainingWork`: concrete unfinished work or the next evidence needed.

Optional routing arrays: `specRefs`, `modules`, `symbols`, `files`, `bugIds`, `tests`, and `tags`.

Optional sections:

- `workCompleted`
- `bugDiagnosis`
- `decisionsAndConstraints`
- `failedAttempts`
- `verification`
- `risks`
- `evidence`

Omit empty optional sections. The renderer must not create placeholder text. Store records under `.agent/handoff/records/<cycle>/<handoff-id>-<slug>.md`.

## Evidence Rules

- Use project-relative paths.
- Record a test as passed only after observing successful output.
- Keep hypotheses out of `bugDiagnosis`; put material uncertainty in `risks`.
- Record constraints only from the user, current code, tests, specifications, or project references.
- Make `remainingWork` specific to this continuation; do not add generic development advice or conversation history.

## Record and Index Roles

The Markdown record is the immutable fact source. Its frontmatter includes the metadata required to rebuild the index. The schema v3 index is a lightweight cache containing routing fields, available section names, grouping, deduplication, path, and time; it does not copy section summaries or bodies.

Index verification requires `available_sections` to match the actual level-two section headings exactly, in renderer order. Every record must contain the three core sections, must not repeat headings, and must not use placeholder content. A rebuild fails without changing the index when any record violates this contract.

## Duplicate Grouping

Group repeated work by strongest stable evidence in order: specification ID, bug ID, file plus symbol, symbol, then normalized title. A shared broad module alone is insufficient.

Exact normalized input is deduplicated before writing. Reordered routing arrays, Unicode width or case differences, and repeated whitespace do not create another record. Changed evidence or sections create a new immutable record and may join the same group.

Chinese phrases of at least three characters may match titles, summaries, tests, and tags. Reliable matches return every record in each matched group without a fixed record count. A prompt that explicitly refers to the previous task or window but has no stronger evidence returns the complete most recent coherent group; it does not open Markdown automatically.
