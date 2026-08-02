# Handoff Format

## Required Input

- `title`: concise feature, module, or problem identity.
- `summary`: evidence-based state useful to another task.

Optional routing arrays: `kind`, `specRefs`, `modules`, `symbols`, `files`, `bugIds`, `tests`, and `tags`.

Optional sections:

- `objective`
- `startingState`
- `workCompleted`
- `bugDiagnosis`
- `behavioralConstraints`
- `changedAreas`
- `verification`
- `risks`
- `evidence`

Store new records under `.agent/handoff/records/<cycle>/<handoff-id>-<slug>.md`. Existing indexed records from earlier layouts remain valid and must not be moved implicitly.

## Evidence Rules

- Use project-relative paths.
- Record a test as passed only after observing successful output.
- Keep hypotheses out of `bugDiagnosis`; put unresolved uncertainty in `risks`.
- Record constraints only from the user, current code, tests, specifications, or project references.
- Do not add generic next-step instructions or conversation history.

## Duplicate Grouping

Group repeated work by strongest stable evidence in order: specification ID, bug ID, file plus symbol, symbol, then normalized title. A shared broad module alone is insufficient.

Exact normalized input is deduplicated before writing. Reordered routing arrays, Unicode width or case differences, and repeated whitespace do not create another record. Changed evidence or sections create a new historical record and may be grouped with related work during matching.

Chinese phrases of at least three characters may match titles, summaries, test names, and tags. A prompt that explicitly refers to the previous task or window but has no stronger evidence returns at most two recent index candidates; it does not open their Markdown automatically.
