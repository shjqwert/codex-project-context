---
name: project-plan-msg
description: Record and transition a qualifying durable project-level plan in .agent/planMsg.md when a significant direction is explicitly tracked, confirmed, started, completed, rejected, or superseded across multiple tasks, modules, or OpenSpec changes. May be selected implicitly for evidence-backed plan lifecycle changes; do not trigger for ordinary bugs, code tasks, temporary ideas, or development journals.
---

# Project Plan Message

Use this Skill only for durable project-level direction. Read [plan-msg-format.md](references/plan-msg-format.md) before creating the first plan or resolving an ambiguous status transition.

## Check Project and Existing Plans

The project must already contain `.agent/context.json`. Never invoke `project-init` implicitly to make plan recording possible.

Resolve the plugin root as two directories above this `SKILL.md`, then list plans:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action list
```

Listing must not create `.agent/planMsg.md`.

## Apply the Admission Rule

Record a plan only when it affects project direction, an important capability, multiple modules, multiple tasks, or multiple OpenSpec changes and has a clear goal or success criteria.

- Track an unconfirmed direction as `proposed` only when the user explicitly asks to preserve it.
- When the user confirms a qualifying direction, create it if absent and transition it to `accepted` in the same workflow.
- Do not record ordinary bugs, single implementation tasks, one OpenSpec task, brainstorming, or progress journals.

## Create

Prepare a temporary UTF-8 JSON input with `title`, `summary`, and supported `successCriteria`, `specRefs`, and `decisions`, then run:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action create --input <absolute-json-input>
```

New records begin as `proposed`. Remove only the temporary input created for this operation.

Equivalent normalized inputs are idempotent. The CLI returns the existing plan ID and status with
`deduplicated: true`; do not create or transition a second plan merely because a request was retried.
Project-context writes are serialized by a short-lived project lock.

## Transition

Supply a concise reason grounded in a user decision, accepted specification, implementation state, or observed verification:

```text
node <plugin-root>/dist/cli/main.js plan --project <absolute-project-root> --action transition --id P001 --status accepted --reason "User approved the project direction."
```

Follow the state graph in [plan-msg-format.md](references/plan-msg-format.md). Terminal plans cannot be reopened; create a replacement when direction genuinely changes.

## Verify

1. Require `ok: true`, inspect `deduplicated`, and confirm the expected final status.
2. Confirm `.agent/planMsg.md` was created only when a plan was actually recorded.
3. When `deduplicated` is `true`, confirm no second plan entry or file was written.
4. Confirm the rendered summary, success criteria, decisions, references, and transition reason match the evidence.
5. Confirm no routine task or unsupported completion claim was added.
