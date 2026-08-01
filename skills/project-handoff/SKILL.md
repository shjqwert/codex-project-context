---
name: project-handoff
description: Create an evidence-based cross-task handoff for an initialized project and update its deterministic index. Use when the user asks to hand off, preserve context, or prepare another Codex task to continue work.
---

# Project Handoff

Create a handoff only from facts available in the current task, code, tests, logs, project references, or accepted specifications. Do not infer a root cause without evidence.

1. Prepare a UTF-8 JSON input with `title` and `summary`; add only supported facts under `modules`, `files`, `symbols`, `tests`, `tags`, and `sections`.
2. Resolve the plugin root as two directories above this `SKILL.md`.
3. Run:

```text
node <plugin-root>/dist/cli/main.js handoff --project <absolute-project-root> --input <absolute-json-input>
```

4. Verify the returned handoff file and `.agent/handoff/index.json`.
5. Remove only the temporary JSON input that you created for this operation.

If the bug root cause is unconfirmed, omit `sections.bugDiagnosis`; the generated record will state that the root cause is unconfirmed. Record tests as passed only when their output was observed in this task.

