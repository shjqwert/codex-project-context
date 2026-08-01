---
name: project-plan-msg
description: Record and transition durable project-level plans in .agent/planMsg.md with deterministic status validation. Use when a key project direction is proposed, accepted, started, completed, rejected, or superseded across multiple tasks or OpenSpec changes.
---

# Project Plan Message

Use this Skill only for a durable project-level direction. Do not record routine bugs, code tasks, a single OpenSpec task, or a development journal.

## Inspect Existing Plans

Resolve the plugin root as two directories above this `SKILL.md`, then run:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action list
```

Read the result before creating a plan or changing its status. Do not create `.agent/planMsg.md` merely to list plans.

## Create a Plan

Prepare a UTF-8 JSON input containing `title` and `summary`. Add only supported facts under `successCriteria`, `specRefs`, and `decisions`, then run:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action create --input <absolute-json-input>
```

New plans start as `proposed`. If the project direction is already accepted, perform a separate evidenced transition instead of bypassing the state machine.

## Transition a Plan

Allowed transitions are:

- `proposed` to `accepted` or `rejected`
- `accepted` to `in-progress`, `rejected`, or `superseded`
- `in-progress` to `completed`, `rejected`, or `superseded`

Terminal states cannot transition further. Supply a concise reason grounded in the user's decision, accepted specification, current code, or observed verification:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action transition --id P001 --status accepted --reason "User approved the project direction."
```

Verify the JSON result and `.agent/planMsg.md`. Remove only a temporary JSON input created for this operation.
