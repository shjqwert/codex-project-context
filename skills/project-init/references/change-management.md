# Change and long-term plan routing

For an existing native openspec/ tree, expose its specification/change entry once
under Project Context, not as a catalog of Project References. Discovery does not
initialize OpenSpec, call an external CLI, create Changes, or rewrite metadata.

The four embedded-change-* Skills own native proposal/design/tasks/delta specs,
verification and archival. They use proposal.md's fixed Change Context section
for status and optional planId; .openspec.yaml keeps native metadata. Reuse
existing documents and stable task IDs. Simple local changes need no Change.

A durable project-level Plan may coordinate several Changes. plan --action list
reads related active and archived Changes without writing their status to the
Plan register. A closed Change never automatically completes a Plan.
Handoffs can link planIds, changeIds and taskRefs qualified by changeId; a bare
task ID is not unique. Keep lifecycle documents in OpenSpec and continuation
state in the handoff, with compact references rather than duplicate task lists.
