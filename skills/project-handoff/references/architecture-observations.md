# 跨任务架构观察

Read this only when coherent work being handed off includes architecture decisions or evidence, with or without a C4 model. It does not
create a handoff for a routine status question or initialize a project implicitly.

## Ownership and identity

架构工作流拥有基线、目标设计、确认依据与验证结论，默认记录在其规范 Markdown 文档中。
LikeC4 仅是可选结构模型，不承载强制批准状态。Project
Context records observations through the existing handoff command; it never edits architecture sources,
parses its AST, or treats a cached statement as user approval. Keep the same workId
when the objective is unchanged and use expectedRevision for each update.

Identify the target project, architecture domain, canonical Architecture Baseline path,
change ID and any existing plan ID; include root element FQN and model paths only when a model exists. IDs from
another project are not identities in this project. 分别描述当前基线、目标设计确认、实施进度和验证结论；
这些是观察维度，不要求来源具有固定状态字段。Implemented never implies pass.

## Use existing sections

- `currentState`: available architecture declarations, observation time and observation quality
  (`current`, `stale`, or `unverified`). These quality labels are not C4 states.
- `decisionsAndConstraints`: 规范 Markdown 中的用户确认依据、具体范围及可定位的内容版本。
  区分方向认可、具体设计确认和实施授权，不要求固定哈希算法或批准字段。
  重大设计变化使原确认不再覆盖相关内容；文字排版修改不自动要求重批。
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

1. Canonical Architecture Baseline Markdown content identity, architecture configuration,
   specification, optional formal model and active changes. Keep the baseline identity separate
   from model and change identities; its hash detects change but is not user approval.
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

内容哈希只检测变化，不代表用户批准。架构工作流记录与具体设计对应的用户证据；
Project Context 只观察，不生成批准，不把模型缺失当成 Markdown 设计未确认。
重大设计变化回到设计负责人；观察结果不能覆盖源文档。缓存与现行来源冲突时保留冲突及出处。

A `confirmed` Architecture Baseline whose relevant claims conflict with current code,
configuration, or the formal model remains a confirmed historical declaration but its
observation quality is `stale`. Do not silently downgrade or rewrite the source file;
route the conflict back to the architecture workflow for audit or evolve review.

## Missing, closed and conflicting sources

Missing files or contradictory metadata mean unknown/stale, not completed. Normal
closure needs explicit closure and verification evidence plus a current/history or Git
locator for the retired change. Blocked/failed changes cannot be treated as closed just
because a file disappeared. Preserve the source declarations and
describe the evidence limitation separately. Hooks route only lightweight current
metadata; they do not scan models, test outputs or all historical observations.
