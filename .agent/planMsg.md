# Project Plans

> Managed project-level plans only. Routine bugs, implementation tasks, and development journals do not belong here.

<!-- PROJECT_PLAN_DATA_START -->
```json
{
  "schemaVersion": 1,
  "plans": [
    {
      "id": "P001",
      "title": "Mutable current handoff with milestone history",
      "summary": "Upgrade handoff storage to one stable work current document with revision-safe updates, selective immutable checkpoints, schema-v3 compatibility, Chinese-first Skill output, focused retrieval, review, release, and local Codex installation.",
      "status": "completed",
      "successCriteria": [
        "Stable workId current documents support create, update, dedupe, checkpoint, status, reopen, and revision conflicts.",
        "Legacy schema-v3 handoffs remain readable and migrate lazily without rewriting old records.",
        "Hooks and matching read current state by default, re-inject new revisions, and isolate history from global BM25.",
        "Focused, full, review, release, and installed-plugin verification pass.",
        "Detailed Chinese changelog is committed and pushed with the version update."
      ],
      "specRefs": [],
      "decisions": [
        "Current Markdown is authoritative; index is a rebuildable cache.",
        "History stores complete post-update milestone snapshots selected semantically by the Agent.",
        "Normal prose defaults to Chinese while identifiers remain exact and aliases remain bilingual.",
        "No transaction journal; valid current state repairs a stale index on access."
      ],
      "createdAt": "2026-08-17T14:12:29.640Z",
      "updatedAt": "2026-08-17T15:13:51.900Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-17T14:12:29.640Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "User confirmed the complete design baseline after the grilling decision tree.",
          "at": "2026-08-17T14:12:29.720Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "User explicitly authorized implementation, review, testing, repair, publication, and local Codex plugin update.",
          "at": "2026-08-17T14:12:29.796Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "Implementation committed and pushed at 5f5643a; TypeScript build and 74/74 tests passed; both Sol Advisor re-reviews passed; local package and installed enabled Codex plugin 1.2.0 with schema v4 and matching Skill hash were verified.",
          "at": "2026-08-17T15:13:51.900Z"
        }
      ],
      "dedupeKey": "sha256:5e03b51927f49180a88880208348e299942984710b6fb5944ee76af21c455165"
    },
    {
      "id": "P002",
      "title": "Remove NotebookLM integration",
      "summary": "Remove the retired NotebookLM MCP integration and every executable, schema, CLI, Skill, test, documentation, generated-package, and installed-cache surface while preserving core project-context behavior and historical changelog evidence.",
      "status": "completed",
      "successCriteria": [
        "No NotebookLM Skill, MCP dependency, CLI command, application module, public type, schema, current documentation, dedicated test, or packaged artifact remains.",
        "Legacy NotebookLM project or library data is never deleted automatically.",
        "Core initialization, synchronization, status, authorization, hooks, handoffs, matching, plans, and packaging tests pass after a clean build.",
        "The verified removal is committed and pushed to the current upstream branch."
      ],
      "specRefs": [],
      "decisions": [
        "Remove the legacy AGENTS.md NotebookLM scrubber together with the retired feature; a normal project sync rewrites the managed section.",
        "Keep existing CHANGELOG entries as historical evidence and add a new removal entry.",
        "Clean generated output before rebuilding so deleted TypeScript sources cannot survive as stale package files."
      ],
      "createdAt": "2026-08-23T14:09:06.339Z",
      "updatedAt": "2026-08-23T14:14:28.875Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-23T14:09:06.339Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "User approved the complete NotebookLM removal plan and requested execution.",
          "at": "2026-08-23T14:09:06.423Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "Implementation, verification, commit, and push have started.",
          "at": "2026-08-23T14:09:06.498Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "NotebookLM removal was committed and pushed at 6c6f9fa; clean TypeScript build and 68/68 tests passed; local package and installed enabled plugin 1.3.0 were verified without retired Skill, schema, module, or CLI surfaces.",
          "at": "2026-08-23T14:14:28.875Z"
        }
      ],
      "dedupeKey": "sha256:e7d1f41d8b5bb37bb3a4878302147241d15c20ba8fc2a0c93444f9763d25e309"
    },
    {
      "id": "P003",
      "title": "Route confirmed solutions through visual architecture review",
      "summary": "Make Embedded Architecture Review explicit or upstream-handoff-only, route stable first-principles and adversarial outcomes into LikeC4 review, and let Codex Project Context recognize stable LikeC4 evidence and record only qualifying durable plans.",
      "status": "completed",
      "successCriteria": [
        "Embedded Architecture Review is not implicitly selected for ordinary development conversations.",
        "First-principles and adversarial-review handoffs preserve confirmed decisions, evidence, findings, and architecture-impact dimensions.",
        "LikeC4 architecture sources are discoverable while generated output and unimplemented To-Be changes are not treated as current project facts.",
        "Qualifying confirmed directions can be recorded as accepted project plans without allowing project-init or project-sync to create planMsg.md.",
        "Skill validation, focused plugin tests, full plugin tests, and independent adversarial review complete without unresolved material findings."
      ],
      "specRefs": [
        "skills/project-plan-msg/SKILL.md",
        "skills/project-plan-msg/references/plan-msg-format.md"
      ],
      "decisions": [
        "Keep project-init and project-sync explicit-only and plan-free.",
        "Use project-plan-msg as the sole owner of .agent/planMsg.md.",
        "Keep LikeC4 source models authoritative for visual review and treat generated HTML or PNG as disposable output.",
        "Do not hand-edit plugin cache; update source and verify before any separately authorized package or installation step."
      ],
      "createdAt": "2026-08-23T15:59:19.586Z",
      "updatedAt": "2026-08-23T16:11:35.281Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-23T15:59:19.586Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "User confirmed the Skill routing and LikeC4 project-context integration design.",
          "at": "2026-08-23T15:59:24.593Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "User authorized the agreed source changes, verification, and independent adversarial review.",
          "at": "2026-08-23T15:59:24.705Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "Implemented the confirmed Skill routing and LikeC4 project-context integration; standalone source and installed Skill hashes match, plugin build and 69/69 tests passed, and independent Sol Advisor adversarial review returned PASS with no material findings.",
          "at": "2026-08-23T16:11:35.281Z"
        }
      ],
      "dedupeKey": "sha256:aa672611756b5b9791310b3b946f487d9e82c85a538b31155fd9767df879cbee"
    },
    {
      "id": "P004",
      "title": "工作流交接、检索精度与 C4 状态跟踪",
      "summary": "按用户确认范围收敛 embedded_skills 交接职责，提高 Project Context 检索精确度并跟踪 C4 四维状态；明确排除 RAG。完整技术方案先接受独立对抗审查，重要发现由用户处置后再确认实施。",
      "status": "completed",
      "successCriteria": [
        "技能交接、模型选择和设备操作职责清晰，原有触发与安全边界不退化。",
        "通过冻结的正例、负例、歧义和中英文改写评测，同时证明精确度与必要召回。",
        "C4 状态能跨任务恢复并辨别过期快照，implemented、pass 与批准声明不混同。",
        "不纳入 RAG 优化，保留现有数据与工作区修改。",
        "独立对抗审查的重要发现经用户处置，后续实施和发布另行确认。"
      ],
      "specRefs": [
        "docs/plans/2026-08-31-workflow-retrieval-c4.md"
      ],
      "decisions": [
        "用户已接受 embedded_skills 的四项调整。",
        "用户要求提升语义检索精确度并跟踪 C4 状态。",
        "用户明确暂不纳入 RAG，正式接入后再讨论。",
        "当前为计划与审查阶段；文档中的技术细节和数值目标仍待审查与确认。"
      ],
      "createdAt": "2026-08-31T06:20:36.111Z",
      "updatedAt": "2026-08-31T09:08:54.408Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-08-31T06:20:36.111Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "用户确认执行完整计划及三项审查补充，C4 采用证据绑定方案；RAG 排除。",
          "at": "2026-08-31T07:11:20.875Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "开始冻结评测、调整技能和检索实现；构建用于测试，发布与安装另行确认。",
          "at": "2026-08-31T07:11:21.232Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "源码及80项测试、独立审查与离线C4验收完成；Project Context 1.5.0、Sol 0.12.2和4个技能已安装验证；三个仓库提交已推送，用户授权移除本地分支命名钩子并保留备份。",
          "at": "2026-08-31T09:08:54.408Z"
        }
      ],
      "dedupeKey": "sha256:d6e9051c7d5ea0ea3397da4cf8ea3a7132a4acd471155358e986a93f59e046ce"
    },
    {
      "id": "P005",
      "title": "嵌入式架构设计与持续治理能力",
      "summary": "联合演进 embedded_skills 与 codex-project-context：将现有 Embedded Architecture Review 扩展为 design、evolve、audit 三种显式模式，建立紧凑 Architecture Baseline 合同，使项目上下文能够发现并正确路由已确认基线，同时保留现有 LikeC4、审批、交接和验证边界。",
      "status": "completed",
      "successCriteria": [
        "embedded-architecture-review 支持 design、evolve、audit，且普通局部开发不会隐式进入架构流程。",
        "Architecture Baseline 具有规范路径、明确状态、职责与依赖合同，并与 LikeC4、活动 change 和代码证据分工清楚。",
        "first-principles-framing、adversarial-review、embedded-code-style、validate-embedded-drivers 能按稳定交接合同协作。",
        "codex-project-context 能发现相关 Architecture Baseline，忽略生成物，不把 proposed、stale 或活动 change 当成已确认事实。",
        "LikeC4 默认使用紧凑源文件目录和可控生成目录，并提供实时预览、单文件 HTML 与 PNG 的明确路由。",
        "两个仓库的最小相关验证与完整适用测试通过，且不修改 Hooks、context schema 或 LikeC4 本身。"
      ],
      "specRefs": [],
      "decisions": [
        "扩展现有 embedded-architecture-review，不创建重复的 project-architecture Skill。",
        "架构 Skill 保持显式调用或可靠上游交接，不承担后台持续监控。",
        "Architecture Baseline 使用 architecture/baseline.md 或 architecture/<domain>/baseline.md；项目上下文仍将其作为 documentation 资源。",
        "代码事实由 CodeGraph、源码和配置提供；架构意图由 baseline.md 保存；结构模型由正式 model.c4 保存；活动变化由 changes/ 保存。",
        "不新增 context schema 类型，不修改 SessionStart/UserPromptSubmit Hooks，不自动执行 project-sync 或吸收架构漂移。"
      ],
      "createdAt": "2026-09-01T10:18:00.623Z",
      "updatedAt": "2026-09-01T10:33:14.074Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-09-01T10:18:00.623Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "用户确认了跨仓库任务范围、职责边界与实施顺序。",
          "at": "2026-09-01T10:18:00.927Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "用户明确要求开始执行，现已进入源码核对、实现和验证阶段。",
          "at": "2026-09-01T10:18:01.238Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "已完成跨仓库实现；codex-project-context 全量 80/80 测试通过，5 个修改 Skill 通过官方 quick_validate，14 个交接标识与 5 个调用策略检查通过，LikeC4 1.59.2 命令已按本机帮助核对。",
          "at": "2026-09-01T10:33:14.074Z"
        }
      ],
      "dedupeKey": "sha256:b8b127ed59518d5d7b576509672d7ffcf5cdac43caa0d4f5ab468dc402da8607"
    },
    {
      "id": "P006",
      "title": "修复嵌入式架构治理审查缺口",
      "summary": "承接已终结的 P005，按用户确认的 Sol Advisor 对抗审查结论，补全 Architecture Baseline 路径、批准证据、状态恢复和显式同步合同，并修复资源发现、交接 token 与 DESIGN/EVOLVE 路由边界。",
      "status": "completed",
      "successCriteria": [
        "根级与域级 Architecture Baseline 的 model、changes、生成目录映射唯一且可执行。",
        "批准门槛绑定当前设计内容身份，baselineStatus 只有一个权威来源，并定义冲突恢复规则。",
        "显式 project-sync 被记录为必须结清的人工后续项，但不增加 Hook、自动扫描或 schema。",
        "生成视图不会进入 Project Context 资源，Architecture Baseline 不会因普通资源上限被遗漏。",
        "审计与代码生成 Skill 的交接 token 和 DESIGN/EVOLVE 前置条件一致。",
        "相关测试、Skill 校验和完整适用测试通过。"
      ],
      "specRefs": [
        "skills/project-init/references/project-discovery.md",
        "skills/project-sync/references/resource-rules.md"
      ],
      "decisions": [
        "P005 已终结且不可重开，本计划作为审查后修正计划替代并引用它。",
        "接受 Sol Advisor 报告的四项决策缺口与四项实现/测试问题作为本轮最小修正范围。",
        "不新增 Hook、context schema、后台扫描、自动同步或自动吸收漂移。",
        "完成修正和验证后再恢复完成结论。"
      ],
      "createdAt": "2026-09-01T11:31:39.879Z",
      "updatedAt": "2026-09-01T11:40:25.420Z",
      "transitions": [
        {
          "from": null,
          "to": "proposed",
          "reason": "Plan recorded.",
          "at": "2026-09-01T11:31:39.879Z"
        },
        {
          "from": "proposed",
          "to": "accepted",
          "reason": "用户确认接受 Sol Advisor 的八项审查发现并开始最小修正。",
          "at": "2026-09-01T11:31:47.698Z"
        },
        {
          "from": "accepted",
          "to": "in-progress",
          "reason": "开始修订架构治理合同、资源发现实现和针对性测试。",
          "at": "2026-09-01T11:31:48.008Z"
        },
        {
          "from": "in-progress",
          "to": "completed",
          "reason": "八项审查缺口均已修正；Project Context 全量 81/81 测试、5 个 Skill 官方校验、4/4 跨 Skill 契约测试与两个仓库 diff 检查通过。",
          "at": "2026-09-01T11:40:25.420Z"
        }
      ],
      "dedupeKey": "sha256:cf5cffda46b714b917c252590fed604493c3d16b655f58e185ddf14261b50cbb"
    }
  ]
}
```
<!-- PROJECT_PLAN_DATA_END -->

## P001 Mutable current handoff with milestone history

- Status: `completed`
- Updated: 2026-08-17T15:13:51.900Z
- Plan references: none

Upgrade handoff storage to one stable work current document with revision-safe updates, selective immutable checkpoints, schema-v3 compatibility, Chinese-first Skill output, focused retrieval, review, release, and local Codex installation.

### Success Criteria

- Stable workId current documents support create, update, dedupe, checkpoint, status, reopen, and revision conflicts.
- Legacy schema-v3 handoffs remain readable and migrate lazily without rewriting old records.
- Hooks and matching read current state by default, re-inject new revisions, and isolate history from global BM25.
- Focused, full, review, release, and installed-plugin verification pass.
- Detailed Chinese changelog is committed and pushed with the version update.

### Decisions

- Current Markdown is authoritative; index is a rebuildable cache.
- History stores complete post-update milestone snapshots selected semantically by the Agent.
- Normal prose defaults to Chinese while identifiers remain exact and aliases remain bilingual.
- No transaction journal; valid current state repairs a stale index on access.

### Status History

- 2026-08-17T14:12:29.640Z: created -> proposed — Plan recorded.
- 2026-08-17T14:12:29.720Z: proposed -> accepted — User confirmed the complete design baseline after the grilling decision tree.
- 2026-08-17T14:12:29.796Z: accepted -> in-progress — User explicitly authorized implementation, review, testing, repair, publication, and local Codex plugin update.
- 2026-08-17T15:13:51.900Z: in-progress -> completed — Implementation committed and pushed at 5f5643a; TypeScript build and 74/74 tests passed; both Sol Advisor re-reviews passed; local package and installed enabled Codex plugin 1.2.0 with schema v4 and matching Skill hash were verified.

## P002 Remove NotebookLM integration

- Status: `completed`
- Updated: 2026-08-23T14:14:28.875Z
- Plan references: none

Remove the retired NotebookLM MCP integration and every executable, schema, CLI, Skill, test, documentation, generated-package, and installed-cache surface while preserving core project-context behavior and historical changelog evidence.

### Success Criteria

- No NotebookLM Skill, MCP dependency, CLI command, application module, public type, schema, current documentation, dedicated test, or packaged artifact remains.
- Legacy NotebookLM project or library data is never deleted automatically.
- Core initialization, synchronization, status, authorization, hooks, handoffs, matching, plans, and packaging tests pass after a clean build.
- The verified removal is committed and pushed to the current upstream branch.

### Decisions

- Remove the legacy AGENTS.md NotebookLM scrubber together with the retired feature; a normal project sync rewrites the managed section.
- Keep existing CHANGELOG entries as historical evidence and add a new removal entry.
- Clean generated output before rebuilding so deleted TypeScript sources cannot survive as stale package files.

### Status History

- 2026-08-23T14:09:06.339Z: created -> proposed — Plan recorded.
- 2026-08-23T14:09:06.423Z: proposed -> accepted — User approved the complete NotebookLM removal plan and requested execution.
- 2026-08-23T14:09:06.498Z: accepted -> in-progress — Implementation, verification, commit, and push have started.
- 2026-08-23T14:14:28.875Z: in-progress -> completed — NotebookLM removal was committed and pushed at 6c6f9fa; clean TypeScript build and 68/68 tests passed; local package and installed enabled plugin 1.3.0 were verified without retired Skill, schema, module, or CLI surfaces.

## P003 Route confirmed solutions through visual architecture review

- Status: `completed`
- Updated: 2026-08-23T16:11:35.281Z
- Plan references: `skills/project-plan-msg/SKILL.md`, `skills/project-plan-msg/references/plan-msg-format.md`

Make Embedded Architecture Review explicit or upstream-handoff-only, route stable first-principles and adversarial outcomes into LikeC4 review, and let Codex Project Context recognize stable LikeC4 evidence and record only qualifying durable plans.

### Success Criteria

- Embedded Architecture Review is not implicitly selected for ordinary development conversations.
- First-principles and adversarial-review handoffs preserve confirmed decisions, evidence, findings, and architecture-impact dimensions.
- LikeC4 architecture sources are discoverable while generated output and unimplemented To-Be changes are not treated as current project facts.
- Qualifying confirmed directions can be recorded as accepted project plans without allowing project-init or project-sync to create planMsg.md.
- Skill validation, focused plugin tests, full plugin tests, and independent adversarial review complete without unresolved material findings.

### Decisions

- Keep project-init and project-sync explicit-only and plan-free.
- Use project-plan-msg as the sole owner of .agent/planMsg.md.
- Keep LikeC4 source models authoritative for visual review and treat generated HTML or PNG as disposable output.
- Do not hand-edit plugin cache; update source and verify before any separately authorized package or installation step.

### Status History

- 2026-08-23T15:59:19.586Z: created -> proposed — Plan recorded.
- 2026-08-23T15:59:24.593Z: proposed -> accepted — User confirmed the Skill routing and LikeC4 project-context integration design.
- 2026-08-23T15:59:24.705Z: accepted -> in-progress — User authorized the agreed source changes, verification, and independent adversarial review.
- 2026-08-23T16:11:35.281Z: in-progress -> completed — Implemented the confirmed Skill routing and LikeC4 project-context integration; standalone source and installed Skill hashes match, plugin build and 69/69 tests passed, and independent Sol Advisor adversarial review returned PASS with no material findings.

## P004 工作流交接、检索精度与 C4 状态跟踪

- Status: `completed`
- Updated: 2026-08-31T09:08:54.408Z
- Plan references: `docs/plans/2026-08-31-workflow-retrieval-c4.md`

按用户确认范围收敛 embedded_skills 交接职责，提高 Project Context 检索精确度并跟踪 C4 四维状态；明确排除 RAG。完整技术方案先接受独立对抗审查，重要发现由用户处置后再确认实施。

### Success Criteria

- 技能交接、模型选择和设备操作职责清晰，原有触发与安全边界不退化。
- 通过冻结的正例、负例、歧义和中英文改写评测，同时证明精确度与必要召回。
- C4 状态能跨任务恢复并辨别过期快照，implemented、pass 与批准声明不混同。
- 不纳入 RAG 优化，保留现有数据与工作区修改。
- 独立对抗审查的重要发现经用户处置，后续实施和发布另行确认。

### Decisions

- 用户已接受 embedded_skills 的四项调整。
- 用户要求提升语义检索精确度并跟踪 C4 状态。
- 用户明确暂不纳入 RAG，正式接入后再讨论。
- 当前为计划与审查阶段；文档中的技术细节和数值目标仍待审查与确认。

### Status History

- 2026-08-31T06:20:36.111Z: created -> proposed — Plan recorded.
- 2026-08-31T07:11:20.875Z: proposed -> accepted — 用户确认执行完整计划及三项审查补充，C4 采用证据绑定方案；RAG 排除。
- 2026-08-31T07:11:21.232Z: accepted -> in-progress — 开始冻结评测、调整技能和检索实现；构建用于测试，发布与安装另行确认。
- 2026-08-31T09:08:54.408Z: in-progress -> completed — 源码及80项测试、独立审查与离线C4验收完成；Project Context 1.5.0、Sol 0.12.2和4个技能已安装验证；三个仓库提交已推送，用户授权移除本地分支命名钩子并保留备份。

## P005 嵌入式架构设计与持续治理能力

- Status: `completed`
- Updated: 2026-09-01T10:33:14.074Z
- Plan references: none

联合演进 embedded_skills 与 codex-project-context：将现有 Embedded Architecture Review 扩展为 design、evolve、audit 三种显式模式，建立紧凑 Architecture Baseline 合同，使项目上下文能够发现并正确路由已确认基线，同时保留现有 LikeC4、审批、交接和验证边界。

### Success Criteria

- embedded-architecture-review 支持 design、evolve、audit，且普通局部开发不会隐式进入架构流程。
- Architecture Baseline 具有规范路径、明确状态、职责与依赖合同，并与 LikeC4、活动 change 和代码证据分工清楚。
- first-principles-framing、adversarial-review、embedded-code-style、validate-embedded-drivers 能按稳定交接合同协作。
- codex-project-context 能发现相关 Architecture Baseline，忽略生成物，不把 proposed、stale 或活动 change 当成已确认事实。
- LikeC4 默认使用紧凑源文件目录和可控生成目录，并提供实时预览、单文件 HTML 与 PNG 的明确路由。
- 两个仓库的最小相关验证与完整适用测试通过，且不修改 Hooks、context schema 或 LikeC4 本身。

### Decisions

- 扩展现有 embedded-architecture-review，不创建重复的 project-architecture Skill。
- 架构 Skill 保持显式调用或可靠上游交接，不承担后台持续监控。
- Architecture Baseline 使用 architecture/baseline.md 或 architecture/<domain>/baseline.md；项目上下文仍将其作为 documentation 资源。
- 代码事实由 CodeGraph、源码和配置提供；架构意图由 baseline.md 保存；结构模型由正式 model.c4 保存；活动变化由 changes/ 保存。
- 不新增 context schema 类型，不修改 SessionStart/UserPromptSubmit Hooks，不自动执行 project-sync 或吸收架构漂移。

### Status History

- 2026-09-01T10:18:00.623Z: created -> proposed — Plan recorded.
- 2026-09-01T10:18:00.927Z: proposed -> accepted — 用户确认了跨仓库任务范围、职责边界与实施顺序。
- 2026-09-01T10:18:01.238Z: accepted -> in-progress — 用户明确要求开始执行，现已进入源码核对、实现和验证阶段。
- 2026-09-01T10:33:14.074Z: in-progress -> completed — 已完成跨仓库实现；codex-project-context 全量 80/80 测试通过，5 个修改 Skill 通过官方 quick_validate，14 个交接标识与 5 个调用策略检查通过，LikeC4 1.59.2 命令已按本机帮助核对。

## P006 修复嵌入式架构治理审查缺口

- Status: `completed`
- Updated: 2026-09-01T11:40:25.420Z
- Plan references: `skills/project-init/references/project-discovery.md`, `skills/project-sync/references/resource-rules.md`

承接已终结的 P005，按用户确认的 Sol Advisor 对抗审查结论，补全 Architecture Baseline 路径、批准证据、状态恢复和显式同步合同，并修复资源发现、交接 token 与 DESIGN/EVOLVE 路由边界。

### Success Criteria

- 根级与域级 Architecture Baseline 的 model、changes、生成目录映射唯一且可执行。
- 批准门槛绑定当前设计内容身份，baselineStatus 只有一个权威来源，并定义冲突恢复规则。
- 显式 project-sync 被记录为必须结清的人工后续项，但不增加 Hook、自动扫描或 schema。
- 生成视图不会进入 Project Context 资源，Architecture Baseline 不会因普通资源上限被遗漏。
- 审计与代码生成 Skill 的交接 token 和 DESIGN/EVOLVE 前置条件一致。
- 相关测试、Skill 校验和完整适用测试通过。

### Decisions

- P005 已终结且不可重开，本计划作为审查后修正计划替代并引用它。
- 接受 Sol Advisor 报告的四项决策缺口与四项实现/测试问题作为本轮最小修正范围。
- 不新增 Hook、context schema、后台扫描、自动同步或自动吸收漂移。
- 完成修正和验证后再恢复完成结论。

### Status History

- 2026-09-01T11:31:39.879Z: created -> proposed — Plan recorded.
- 2026-09-01T11:31:47.698Z: proposed -> accepted — 用户确认接受 Sol Advisor 的八项审查发现并开始最小修正。
- 2026-09-01T11:31:48.008Z: accepted -> in-progress — 开始修订架构治理合同、资源发现实现和针对性测试。
- 2026-09-01T11:40:25.420Z: in-progress -> completed — 八项审查缺口均已修正；Project Context 全量 81/81 测试、5 个 Skill 官方校验、4/4 跨 Skill 契约测试与两个仓库 diff 检查通过。
