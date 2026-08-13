# 中文变更日志

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
