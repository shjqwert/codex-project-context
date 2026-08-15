# Project integration

## Local state

Run `codex-project-context notebooklm-index --project <root> --action status`.

- Missing `.agent/notebooklm-index.json` means `unconfigured`.
- `schematic` and `manual` mean enabled; `disabled` means this experimental workflow is disabled.
- An existing malformed index, including one without `mode`, is invalid for this experimental operation only.
- Configure only with `--action configure --input FILE|-`. The CLI validates schema v1 and never modifies `AGENTS.md`.

The index binds stable notebook/source/note IDs. An enabled project binds at least one notebook and at most one per `project` or `public` scope; either scope may be used alone or both together. Component and document categories are a separate dimension.

## Explicit configuration

When the user explicitly requests NotebookLM configuration and state is `unconfigured`, ask which isolated mode to configure:

- Recommend `schematic` when the user selects one PDF schematic.
- Use `manual` for NotebookLM retrieval without a schematic.
- Use `disabled` to turn off the experimental workflow. Re-enable only through explicit configure.

Before enabled work, call a read-only NotebookLM operation such as `server_info` with account checking or `notebook_list`. If connection/authentication fails, stop only this experimental operation and guide recovery. Never block or redirect `project-init`, `project-sync`, project status, authorization, or local-document retrieval.

In schematic mode, read only the selected project-relative PDF. Support text PDFs and OCR-capable PDF inspection for scanned pages. Extract MCU, driver, power, communication, sensor, MOS, and other IC identity as reference designator, full part number, package when visible, page, and confidence. Values, nets, voltages, currents, and topology need no separate authorization; record them only when needed for identification or a user query.

Re-extract components only when the selected PDF SHA-256 changes. Do not refresh NotebookLM sources as a side effect. In manual mode, retain notebook bindings without a schematic. A changed hash is an experimental advisory and never blocks core project-context commands.

## Status and refresh

Status reports connection/authentication, local mode, notebook bindings, and count summaries without revealing secrets.

Refresh is manual. For each bound notebook, use `notebook_describe` or `source_list`, reconcile stable IDs and processing state, then configure the validated index. A newly added NotebookLM source becomes usable after refresh; no elapsed-time rule triggers it.
