# 中文变更日志

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
