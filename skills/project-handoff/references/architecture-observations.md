# C4 observations across tasks

Read this only when coherent work being handed off includes C4 state. It does not
create a handoff for a routine status question or initialize a project implicitly.

## Ownership and identity

The architecture workflow owns C4 metadata and its legal state transitions. Project
Context records observations through the existing handoff command; it never edits C4,
parses its AST, or treats a cached statement as user approval. Keep the same workId
when the objective is unchanged and use expectedRevision for each update.

Identify the target project, architecture domain, change ID, root element FQN, model
and change paths, and any existing plan ID. IDs from another project are not identities
in this project. Record four separate declarations: baselineStatus, designStatus,
implementationStatus and verificationStatus. Implemented never implies pass.

## Use existing sections

- `currentState`: four declarations, observation time and observation quality
  (`current`, `stale`, or `unverified`). These quality labels are not C4 states.
- `decisionsAndConstraints`: explicit approval/decision evidence and its scope;
  distinguish direction approval, To-Be approval and implementation authorization.
- `verification`: applicable verification scope, target and active build variant,
  exact evidence identities and what was checked. Missing evidence remains visible.
- `evidence`: source locators and fingerprints; `remainingWork`: concrete pending
  checks, blocked hardware or required review. Never copy the whole DSL or logs.

A readable observation can use a short table; it is prose within the current document,
not another JSON protocol, registry or hidden approval record. Plans track durable
goals; current handoffs track continuation; models and reports remain their sources.
Late architecture references belong here rather than a duplicate project plan.

## Conditions for reusing a verification conclusion

Record and compare identities for all applicable inputs, with a stated scope:

1. Architecture configuration, specification, formal model and active changes.
2. Implementation sources and configuration, including the scoped file inventory so
   added or removed inputs are detected; a Git commit alone is insufficient with a dirty tree.
3. Active build variant, toolchain/build settings and firmware or build artifact identity.
4. Test inputs/procedure and result/report identity, including report content rather
   than its path alone, and the actual verification scope and target identity.

Use content hashes or reproducible manifests where possible. Explain an inapplicable
category from evidence; never silently omit a necessary input. Equal model hashes and
the existence of a report do not prove that the firmware or result is unchanged.

On a new task, a state query, or before relying on old pass, check these identities
against current inputs. Only a complete unchanged applicable chain permits reuse of
the recorded conclusion for its original scope. A changed input is `stale`; absent or
uncheckable evidence is `unverified`. Report "model declares pass; current evidence
has not been verified" in either case instead of claiming current verification success.
Do not run hardware tests merely to fill a handoff; preserve the blocker.

An input hash detects change; it is not a signature binding user approval. Status-only
C4 edits also change bytes: the architecture workflow updates and validates its source
first, then refreshes the observation. Material design changes return to its review
contract. Project Context must never restore stale C4 values from the observation.

## Missing, closed and conflicting sources

Missing files or contradictory metadata mean unknown/stale, not completed. Normal
closure needs explicit closure and verification evidence plus a current/history or Git
locator for the retired change. Blocked/failed changes cannot be treated as closed just
because a file disappeared. Preserve the model's four-dimensional declaration and
describe the evidence limitation separately. Hooks route only lightweight current
metadata; they do not scan models, test outputs or all historical observations.
