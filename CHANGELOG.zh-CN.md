# 中文变更日志

## 1.7.0（开发分支，实际测试未执行）

- 评审修订：Handoff 索引新写入升级 v5，读取兼容 v3/v4；只读访问不因版本升级重写有效索引，旧 current/history Markdown 保持可读。
- Hook 在会话内原子预约输出，保留进程退出后的重试机会；按 hooks.json 的总上限计算完整上下文，未输出卡片保持可用。stdout 与状态落盘间中断仍可能重发，尚无运行验证。
- 补充中文原理图和清晰源码目录线索；project-sync 的架构、硬件细节改为条件参考。

- init/sync 按 Core、Build、Hardware、Architecture、Change 分层读取参考；记录有依据的构建/测试入口，识别 IAR 与 Keil 工程，保留用户规则及过期输入保护。
- 无原理图正常初始化；后续显式同步或直接分析交由 RAG 处理，项目上下文只保存资源入口和简短原则。
- Plan 查询只读聚合原生 OpenSpec 的活动及归档 Change；交接增加可选 Plan、Change 与限定 Change 的 Task 引用，旧记录无关联时保持去重身份。
- Hook 按成功输出的卡片去重，保留多结果、候选项、截断恢复与修订提示；交接排除实时 J-Link 数据及捕获引用。
- 本轮仅检查源码逻辑、接口、文档与差异。实际测试、编译、构建、安装、main 合并、标签、打包与发布均待后续专项验证。

## 1.6.0（2026-09-01）

### Architecture Baseline

- 将 `architecture/baseline.md` 与 `architecture/<domain>/baseline.md` 识别为具有专用读取目的的架构基线资源。
- 根级单域与多域布局使用明确的正式模型、活动变化和 `.generated/likec4/` 映射；Project Context 仍不确认或修改基线状态。
- Architecture Baseline 在有界资源列表中优先于普通文档，避免被通用 24 项资源上限意外截断。

### 生成物与跨任务证据

- 忽略 `.generated/` 以及误放在 `architecture/` 下的 HTML、SVG、PNG、布局 JSON 和常规 LikeC4 生成目录，避免将可再生视图作为架构事实或指纹输入。
- handoff 可观察基线内容身份、设计批准范围、批准指纹和明确批准证据，但不会把哈希当作用户批准或反向改写架构工件。
- 新建、移动或确认基线后的 project-sync 保持显式执行；同步完成前，生成的 Project Context 按陈旧上下文处理。

### 验证

- 增加生成视图过滤、保留合法同名架构域和 Architecture Baseline 资源优先级回归测试；TypeScript 干净构建和完整测试通过，结果为 81/81。
- CLI、`package.json` 与插件清单版本已核对为 `1.6.0`，清单构建版本为 `1.6.0+codex.20260901115236`。

## 1.5.0（2026-08-31）

- 本地打包跳过遗留空 Skill 目录树，不删除源目录；非空但缺少 SKILL.md 的目录在替换安装包前报错，避免携带无效技能。
- Windows 创建写锁遇到 EPERM 时仅在原超时内重试创建，不据此删除锁；持续权限拒绝仍报错且不执行受保护写入。

- 检索保留陌生主题的覆盖率，避免中文重叠 n-gram 夸大证据；明确排除和带主题续接不再回退无关工作。
- 区分可靠结果与歧义候选；Hook 不自动要求读取候选正文，CLI 增加只读 `match --explain` 诊断。
- 增加冻结候选、aliases、查询和标签的检索评测，以及多目标完整性与误召回验证。
- 移除初始化/同步对 MarkItDown 的专属指令，保留有边界的本地读取与可选 Context7。
- C4 观察沿用 current handoff 章节，分离声明状态与证据新鲜度；复用验证结论须核对模型、实现、构建和结果身份。

## 1.4.0（2026-08-24）

### LikeC4 架构上下文

- 项目发现支持 `architecture/` 目录和 `.c4`、`.likec4` 架构源文件，并忽略可重新生成的 `.generated` 输出。
- 项目同步只把已验证的 As-Is 架构视图作为当前事实；未实现的 To-Be 视图保持方案状态，不会被提升为当前架构。
- 项目计划可记录 LikeC4 视图和架构影响证据，并在同一未终结目标上复用现有计划，而不是重复创建计划。

### Skill 协作

- `project-plan-msg` 使用通用的 `Plan references` 契约接收外部方案与架构审查 Skill 的证据。
- `project-init` 和 `project-sync` 继续只维护项目事实，不隐式创建计划。
- 补充另一台电脑上安装 Embedded Skills、LikeC4 CLI、官方 DSL Skill 和 MCP 的可重复步骤。

### 验证

- TypeScript 干净构建和完整测试通过，结果为 69/69。
- 本地市场包生成通过；独立对抗性复核未发现阻断发布的问题。

## 1.3.0（2026-08-23）

### 移除

- 移除已停用的 NotebookLM MCP 依赖及显式实验 Skill。
- 移除 `notebooklm-index`、`notebooklm-library` CLI、应用模块、公共类型、schema 和专属测试。
- 移除当前 README、实验上下文和历史需求文档中的现行功能入口；既有版本记录继续保留为历史证据。

### 构建与兼容

- 构建前清理 `dist/`，防止已删除源码的旧产物进入本地市场包。
- 不自动删除任何项目或资料库中的旧索引、上传清单、PDF 或远端数据。
- 正常 `project-init` 或 `project-sync` 仍会重建插件管理的 `AGENTS.md` 段，不再生成已移除集成的入口。

### 验证

- TypeScript 干净构建和完整测试通过，结果为 68/68。
- 本地市场包与已安装插件缓存均为 1.3.0，只保留四个核心 Skill 和五个核心 schema；已移除的 CLI 命令返回未知命令。

## 1.2.0（2026-08-17）

### Handoff 当前态模型

- 将“每次交接创建一条不可变记录”调整为“每个核心目标维护一个稳定 `workId` 和一份 current 文档”；真实状态变化递增 revision，等价输入保持幂等。
- 新 current 路径为 `.agent/handoff/current/<cycle>/<workId>-<initial-slug>.md`；标题变化不引起路径重命名。
- 增加 `active`、`blocked`、`completed`、`superseded` 四种状态；关闭态只有在显式 `reopen: true` 且目标状态为 `active` 时才能继续更新。
- 更新必须提供 `workId + expectedRevision` 并提交完整状态；陈旧窗口收到结构化 `conflict`，不会覆盖较新 revision。

### 关键里程碑历史

- Agent 语义判断关键里程碑后，可将更新后的完整状态保存到 `.agent/handoff/history/<cycle>/<workId>/R<revision>.md`。
- 增加不递增 revision 的独立 checkpoint 操作；同 revision 快照自动去重，历史默认永久保留。
- `checkpointReason` 只在命令结果中返回，不写入 Markdown；普通进度更新不创建历史文件。
- 新增 `handoff-history` CLI，按明确 `workId` 和可选 revision 读取历史；历史不加入全局 BM25 或默认 Hook 上下文。

### 检索、Hook 与中文内容

- schema v4 索引改为“一个工作一条 current 项”，current Markdown 是权威来源，索引仍是可重建缓存。
- Hook 注入身份改为 `workId + revision`：未变化的 current 在同一 Codex 任务中继续抑制，新 revision 可重新注入。
- 自然语言排序优先 `active/blocked`，精确 ID、旧记录 ID、路径、符号和模块匹配不受状态影响。
- `project-handoff` Skill 默认使用中文生成标题、摘要和正文；路径、符号、测试名与其他技术标识符保持原样，aliases 继续同时覆盖中文和英文。

### 兼容与恢复

- schema-v3 Markdown 和索引保持只读兼容，不自动移动、翻译或重写旧记录。
- 同组旧记录按创建时间映射为虚拟 revisions，最早 ID 成为稳定 `workId`，其他旧 ID 保留精确检索能力；首次显式更新才惰性生成 v4 current。
- 未引入事务清单。current 已写而索引尚未更新时，后续访问可在项目锁内从有效 current 修复索引和缺失的已声明 checkpoint。
- current 损坏时停止该工作的自动注入与更新，禁止从 history 静默覆盖；单个 history 损坏只影响历史查询和严格验证。

### 接口与版本

- `handoff` 正常结果保持紧凑，返回 action、workId、revision、status、deduplicated，以及按需返回的 snapshotPath/checkpointReason。
- `handoff-index verify/rebuild` 改为报告工作、current、history 和旧记录数量。
- 包、CLI 和插件清单版本统一升级为 `1.2.0`。

### 验证与独立复核

- TypeScript 目标构建通过；完整 `npm test` 通过 74/74。
- 新增并观察通过的回归面包括：并发等价新建、并发陈旧 revision 冲突、关闭态显式重开、更新后完整 checkpoint、独立 checkpoint 去重、v3 惰性迁移、缺失 legacy 事实拒绝迁移、current/index 中断恢复、损坏 current 防覆盖、损坏 history 隔离、history 词项不进入默认匹配、Hook 新 revision 重注入、未知 CLI 选项拒绝和严格整数解析。
- Sol Advisor 状态/迁移审查最初发现“损坏 current 可被覆盖”和“缺失 legacy 文件仍可迁移”两项高风险问题；修复后原复现与聚焦测试均通过，复核结论为 PASS。
- Sol Advisor CLI/发布审查最初发现未知选项静默忽略、浮点参数被截断、`authorization remove` 文档缺失和 history 测试缺口；修复后构建、CLI、matcher 与原复现均通过，复核结论为 PASS。

## 1.1.0（2026-08-16）

### 调整

- Sol Advisor 项目策略改为“全局默认可用、项目可单独禁用”：缺失授权表示继承，`true` 表示显式允许，`false` 表示显式禁用。
- `project-init` 默认不再写冗余授权文件；新增 `enable`、`disable`、`inherit` 三态命令，旧 `remove` 保留为 `disable` 的兼容别名。
- 项目级 `AGENTS.md` 管理段和 `.agent` 上下文文件继续只由 Project Context 写入；两个插件均不写用户级 `AGENTS.md`。
- 项目管理段仅保留精简的 Sol Advisor 集成和策略边界，详细岗位、模型与返回协议由 Sol Advisor Skill 维护。

### 兼容性

- 旧项目中已有 `true` 授权继续保持允许；首次显式同步无授权且无新版集成标记的旧项目时写入 `false`，避免原禁用状态被新默认反转。
- 非布尔授权仍在任何同步写入前失败关闭。

## 1.0.1（2026-08-15）

### 调整

- 将 NotebookLM 能力改名为显式调用的 `notebooklm-reference-experimental` Skill，并禁止隐式触发。
- `project-init`、`project-sync`、`status` 和授权流程不再读取、校验或渲染 NotebookLM 状态。
- 保留实验 CLI、schema 与现有本地数据格式，NotebookLM 故障仅影响显式实验操作。

### 兼容性

- 下一次正常初始化或同步会清理旧管理段中的 NotebookLM 入口，但不会删除索引、上传清单、PDF 或远端 Notebook 数据。
- 不修改 `v1.0.0` 标签和 Git 历史。

## 1.0.0（2026-08-15）

### 新增

- 新增 `notebooklm-reference` Skill，支持状态检查、限定 Source 检索、手动刷新、显式上传和经验 Note。
- 新增 schema v1 `.agent/notebooklm-index.json` 与 `notebooklm-index` CLI，保持 `.agent/context.json` schema v2 不变。
- 新增独立 PDF 资料库扫描、SHA-256 增量清单和 `notebooklm-library` CLI。

### 调整

- `project-init` 与 `project-sync` 增加一次性 NotebookLM 模式选择和连接/认证恢复流程。
- NotebookLM 启用时 `AGENTS.md` 仅增加一行索引入口；来源刷新保持手动触发。
- PDF 原理图变化只触发器件重提取，不自动刷新 NotebookLM 来源。

## 0.5.0（2026-08-13）

### 新增

- `project-init` 在检查项目清单前调用 `prepare-indexes`，自动创建缺失的 CodeGraph 和 Serena 项目索引。
- 新增 `prepare-indexes` CLI；只使用已经安装的命令，不安装、升级、刷新或重建外部工具。
- Serena 首次建索引时根据项目语言生成非交互参数；嵌入式 C/C++ 工程使用 `cpp` 语言服务器。
- 初始化默认创建 Sol Advisor 隐式委派授权；用户可通过 `--no-sol-advisor-implicit-delegation` 明确关闭。

### 调整

- 项目清单扫描深度从 3 提升到 12，条目上限从 5000 提升到 50000，以覆盖多层嵌入式工程目录。
- 清单增加扫描完整性信息；达到深度或条目上限时停止初始化，避免基于不完整证据生成项目规则。
- 忽略 `tmp` 和 `.metadata` 等临时目录，同时继续覆盖常见的 `Appl`、生成代码、BSW、MCAL 和 RTE 源码目录。
- CodeGraph 和 Serena 首次建索引后的增量维护交由各自 MCP 完成，不绑定 `project-sync`，也不加入 Hook。

### 兼容性

- `project-sync` 继续只维护 `.agent/context.json`、handoff 索引边界和 `AGENTS.md` 管理段。
- CodeGraph 或 Serena 不可用或首次建索引失败时，初始化流程会报告具体状态并回退到普通代码分析。
