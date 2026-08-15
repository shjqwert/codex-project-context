# Project Knowledge Context

This archived experimental context defines the language used by the explicit-only NotebookLM reference Skill. It is not part of core project initialization, synchronization, status, authorization, or generated guidance.

## Language

**Project Knowledge Index（项目知识索引）**:
The project-local map that records which external knowledge is relevant to the project and how it can be located again.
_Avoid_: PDF index, manual list

**Unconfigured State（未配置状态）**:
The absence of `.agent/notebooklm-index.json`; only an explicit experimental configuration request may ask whether to persist schematic, manual, or disabled mode.
_Avoid_: disabled, missing mode

**Schematic Anchor（原理图锚点）**:
The selected PDF schematic whose component identities establish the hardware-document search scope for a project.
_Avoid_: uploaded schematic, NotebookLM schematic

**Project Notebook（项目专属库）**:
A NotebookLM notebook containing knowledge whose applicability is limited to one project or board.
_Avoid_: private notebook, local notebook

**Public Reference Notebook（公共资料库）**:
A single bound NotebookLM notebook containing reusable chip manuals and knowledge that can serve multiple projects.
_Avoid_: global truth, shared project notebook

**Document Category（文档类别）**:
The independent classification of a PDF as MCU, Driver, MOS, or Other IC plus its document type; it does not determine project/public scope.
_Avoid_: notebook scope, folder name

**Source Binding（来源绑定）**:
An explicit association between a project subject, such as a chip, and one or more NotebookLM sources selected for retrieval.
_Avoid_: filename match, source cache

**Manual Refresh（手动刷新）**:
A user-triggered reconciliation of the Project Knowledge Index with the current NotebookLM source inventory.
_Avoid_: automatic sync, scheduled refresh

**Experience Note（经验文档）**:
An updateable NotebookLM note containing verified, reusable knowledge about a chip, board, or project under stated conditions.
_Avoid_: chat summary, scratch note

**Manual Retrieval Mode（手动检索模式）**:
A project mode that uses bound NotebookLM knowledge without deriving its retrieval scope from a schematic.
_Avoid_: no-index mode, fallback mode

**Library Upload Manifest（资料库上传清单）**:
The schema-v1 `.notebooklm-upload-manifest.json` stored at a standalone PDF root for hash-based incremental upload and replacement tracking.
_Avoid_: project index, credential store
