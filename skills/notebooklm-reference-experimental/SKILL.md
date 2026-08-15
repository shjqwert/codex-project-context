---
name: notebooklm-reference-experimental
description: Explicitly use the experimental NotebookLM PDF knowledge workflow for connection or binding status, source-scoped chip-document search, manual source refresh, standalone or project PDF upload, and saving verified or provisional engineering experience notes. Use only when the user explicitly invokes this Skill or explicitly requests NotebookLM; never invoke it from project-init, project-sync, project status, authorization, or ordinary local-document retrieval.
---

# NotebookLM Reference Experimental

Treat this as an isolated experimental workflow. Use the `notebooklm` MCP to retrieve evidence from already-bound project and public notebooks, or to perform an explicitly requested write. Never make core project-context work depend on this Skill, its MCP, or its local files.

## Route the operation

- `status`: read [project-integration.md](references/project-integration.md).
- `search`: read [project-integration.md](references/project-integration.md) and [retrieval-and-experience.md](references/retrieval-and-experience.md).
- `refresh`: read [project-integration.md](references/project-integration.md). Refresh only on explicit request; there is no TTL.
- `upload <PDF root>`: read [library-upload.md](references/library-upload.md). This mode does not require a project.
- `save-experience`: read [retrieval-and-experience.md](references/retrieval-and-experience.md).

## Global boundaries

1. Check the MCP connection and authentication before an enabled experimental operation. On failure, stop only this operation and guide reconnection or authentication.
2. Treat `notebook_list`, `notebook_describe`, `source_list`, `source_read`, and source-scoped `chat_ask` as retrieval. Preserve returned source citations and IDs.
3. Require explicit user intent before `notebook_create`, `source_add`, `source_rename`, `source_delete`, or `note_save`. Never upload during ordinary init, sync, status, search, or refresh.
4. Never place credentials, cookies, tokens, account email, or manual body text in local index or manifest files.
5. Report uncertainty. Do not invent a source match, revision, component identity, or conflict resolution.
6. Keep failures isolated. Missing authentication, MCP failures, malformed indexes, and changed schematics stop only this experimental operation.
