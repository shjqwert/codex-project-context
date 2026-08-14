# Standalone PDF library upload

Invoke as `$notebooklm-reference upload <PDF root>`. The root may be on another computer and does not need `.agent`, a project, or a schematic.

## Inspect and classify

1. Run `codex-project-context notebooklm-library --root <root> --action inspect` for bounded recursive PDF enumeration and SHA-256. It ignores non-PDF files and symlinks.
2. Reuse valid entries in `<root>/.notebooklm-upload-manifest.json`; skip unchanged ready hashes.
3. Read filename, PDF metadata, first page, and only enough later content to identify:
   - category: MCU, Driver, MOS, or Other IC;
   - document type: Datasheet, Reference Manual, Errata, Application Note, Hardware Design Guide, or Other;
   - manufacturer, exact part numbers, document number, revision, and publication date when present.
4. Mark uncertain model/category/version/duplicate relationships `ambiguous` for user confirmation. High-confidence unique targets may proceed.

## Bind and upload

Use one user-bound `public` Notebook for all categories. If it is missing, ask for a binding. Call `notebook_create` only when the user explicitly requests creation.

Standardize source titles as `<Manufacturer> <Part or Family> - <Document Type> [<Document Number>] [Rev <Revision>]`, omitting unknown bracketed fields. Upload with `source_add` and wait for Ready (`wait=true` or `source_wait`) before recording `sourceId` and `ready` status.

For a candidate replacement, first upload and reach Ready, then verify document number, chip applicability, and revision. Only then call destructive `source_delete` for the old source and mark the old manifest entry `superseded`. If upload or verification fails, keep the old source and mark the new attempt `failed` or `ambiguous`.

After each decided batch, write a complete schema-v1 manifest through `codex-project-context notebooklm-library --root <root> --action update --input FILE|-`. Store only relative paths, hashes, file properties, classification, public Notebook binding, Source IDs/titles, and processing state. Never modify local PDFs or store authentication data.
