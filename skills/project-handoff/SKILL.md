---
name: project-handoff
description: Create an evidence-based cross-task handoff and update its lightweight relevance index when coherent work must continue in another Codex task or window. May be selected implicitly when durable continuation context is needed; do not trigger for routine questions, trivial edits, or mechanical session shutdown.
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

Use only facts supported by the current task, source, tests, logs, project references, or accepted specifications. Root-cause claims require evidence. If root cause remains uncertain, omit `sections.bugDiagnosis` and record the uncertainty only when it affects continuation.

## Record

1. Prepare a UTF-8 JSON value in memory with `title`, `summary`, one supported `kind`, and the required `objective`, `currentState`, and `remainingWork` sections.
2. Generate 2-6 concise retrieval aliases from confirmed task concepts: include at least one natural Chinese phrase and one natural English phrase. Use phrases a future user could search for; do not translate identifiers, duplicate the title or summary, or use broad filler such as `功能`, `模块`, `代码`, `问题`, or `处理`.
3. Add the aliases, only supported routing metadata, and non-empty conditional sections.
4. Resolve the plugin root as two directories above this `SKILL.md`.
5. Run:

```text
node <plugin-root>/dist/cli/main.js handoff --project <absolute-project-root> --input -
```

6. Write the prepared JSON directly to the command's standard input. Do not create an intermediate JSON file.

Equivalent normalized inputs are idempotent. The CLI returns the existing handoff ID with
`deduplicated: true` and must not create another Markdown file or index entry. Project-context
writes are serialized by a short-lived project lock.

## Verify

1. Require `ok: true`, a project-local output path, and inspect `deduplicated`.
2. When `deduplicated` is `true`, confirm the returned ID and file already existed and no new record was written.
3. Inspect a newly created Markdown file for evidence accuracy and unsupported claims.
4. Confirm `.agent/handoff/index.json` contains the entry, bounded bilingual aliases, routing metadata, available section names, deterministic group key, and dedupe key without copying section bodies.
5. Confirm passed tests were actually observed in the current task.
6. Confirm duplicate grouping did not merge unrelated work merely because it shared a broad module.
7. Confirm the Markdown contains no empty or placeholder sections and can supply the metadata needed to rebuild the index.
8. Confirm aliases are specific to this work, include both languages, and do not repeat titles, summaries, paths, identifiers, or broad filler terms.

Report the handoff ID and path. Keep current code, tests, and accepted specifications authoritative over historical records.

## Repair the Index

When the index is missing, suspected stale, or inconsistent, verify before rebuilding:

```text
node <plugin-root>/dist/cli/main.js handoff-index --project <absolute-project-root> --action verify
```

If verification fails because the cache differs from valid Markdown fact records, rebuild it explicitly:

```text
node <plugin-root>/dist/cli/main.js handoff-index --project <absolute-project-root> --action rebuild
```

Rebuild only from current-format records. Reject unsupported headings, missing core sections, placeholder content, or disagreement between `available_sections` and actual Markdown sections; never overwrite records to make an index pass.
