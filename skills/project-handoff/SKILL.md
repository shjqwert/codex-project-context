---
name: project-handoff
description: Create an evidence-based cross-task handoff and update its deterministic section-level index when work on a coherent feature, module, or bug investigation must continue in another Codex task or window. May be selected implicitly when durable continuation context is needed; do not trigger for routine questions, trivial edits, or mechanical session shutdown.
---

# Project Handoff

Create a handoff from current-task evidence, not from reconstructed conversation guesses. Never bind handoff creation mechanically to `SessionEnd`.

## Decide Whether to Record

Create a record when at least one condition holds:

- work on a coherent feature, module, or bug continues in another task;
- verified implementation or diagnosis would otherwise need to be rediscovered;
- constraints, failed approaches, or incomplete verification materially affect continuation;
- the user asks to preserve or hand off context.

Skip routine questions, trivial edits, duplicated information with no new evidence, and work fully represented by an accepted specification without continuation risk.

## Collect Evidence

Read [handoff-format.md](references/handoff-format.md) for field rules. Read [examples.md](references/examples.md) when diagnosis quality, duplicate grouping, or evidence boundaries are uncertain.

Use only facts supported by the current task, source, tests, logs, project references, or accepted specifications. Root-cause claims require evidence. If root cause remains uncertain, omit `sections.bugDiagnosis`; the renderer will state that it is unconfirmed.

## Record

1. Prepare a temporary UTF-8 JSON input with `title` and `summary`.
2. Add only supported metadata and non-empty sections.
3. Resolve the plugin root as two directories above this `SKILL.md`.
4. Run:

```text
node <plugin-root>/dist/cli/main.js handoff --project <absolute-project-root> --input <absolute-json-input>
```

5. Remove only the temporary input created for this operation.

Equivalent normalized inputs are idempotent. The CLI returns the existing handoff ID with
`deduplicated: true` and must not create another Markdown file or index entry. Project-context
writes are serialized by a short-lived project lock.

## Verify

1. Require `ok: true`, a project-local output path, and inspect `deduplicated`.
2. When `deduplicated` is `true`, confirm the returned ID and file already existed and no new record was written.
3. Inspect a newly created Markdown file for evidence accuracy and unsupported claims.
4. Confirm `.agent/handoff/index.json` contains the entry, section summaries, deterministic group key, and dedupe key.
5. Confirm passed tests were actually observed in the current task.
6. Confirm duplicate grouping did not merge unrelated work merely because it shared a broad module.

Report the handoff ID and path. Keep current code, tests, and accepted specifications authoritative over historical records.
