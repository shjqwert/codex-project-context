# Project Plan Admission and Lifecycle

## Qualifying Plan

A plan must have a durable project-level goal and at least one of:

- important capability or architectural direction;
- impact across multiple modules or tasks;
- execution across multiple Codex windows;
- multiple OpenSpec changes serving the same direction.

It must also have enough information to state a title, summary, and success criteria or explicit tracking decision.

Do not admit routine bugs, code tasks, one OpenSpec task, temporary ideas, or development journals.

## Creation

`.agent/planMsg.md` does not exist until the first qualifying plan is recorded. Listing, initialization, synchronization, and handoff creation must not create it.

- Explicitly tracked but unconfirmed direction: create as `proposed`.
- Confirmed direction: create as `proposed`, then immediately transition to `accepted` with the confirmation evidence.

Exact normalized input is idempotent. Reordered criteria, references, or decisions and differences in Unicode width, case, or repeated whitespace return the existing plan. A genuinely changed direction must change its supported summary, criteria, references, or decisions; terminal plans remain immutable.

## State Graph

```text
proposed -> accepted | rejected
accepted -> in-progress | rejected | superseded
in-progress -> completed | rejected | superseded
completed | rejected | superseded -> terminal
```

Completion requires observed success evidence. A superseded plan remains immutable; the replacement receives a new ID and may reference the old plan in its decisions.
