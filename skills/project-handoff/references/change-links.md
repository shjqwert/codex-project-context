# Plan, Change and task references

Add only known links to the normal handoff input:

```json
{
  "planIds": ["P001"],
  "changeIds": ["uart-recovery"],
  "taskRefs": [{"changeId": "uart-recovery", "taskId": "T001"}]
}
```

Plan IDs use P<number>; task IDs use T<number>. Change IDs use the native change
directory's lowercase hyphenated name. Empty or absent links remain absent.
Do not invent associations from a similar title or duplicate task name.

Query with a qualified locator such as uart-recovery/T001. A bare T001 is only a
candidate because multiple Changes can use it. Exact work IDs retain precedence;
neither these links nor a group key authorize choosing a mutable work target.

OpenSpec owns proposal status, requirements, design, task checkboxes, verification
and archival. Handoff owns the continuation objective, confirmed progress, evidence
gaps, next action and compact locators. Avoid copying a whole task list or knowledge
body. A Change's completion does not transition a long-term Plan.

After archival, retain the stable Change ID and update affected current handoff
locators through the existing revision-checked workflow when continuation needs it.
Do not rewrite history or reopen completed work merely to refresh a path; resolve
its stable ID in the native archive instead. If the workflow is unavailable,
report the exact references needing attention. Old records without links remain
readable and retain their existing dedupe identity.

Live J-Link variables, register snapshots, HSS samples and capture references never
belong in a handoff or RAG. Re-observe current hardware when needed; record only
durable engineering decisions and source/document evidence that remain meaningful.
