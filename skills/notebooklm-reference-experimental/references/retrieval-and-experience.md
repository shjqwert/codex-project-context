# Experimental retrieval, conflicts, and experience

## Search

1. Select only source IDs bound to the requested component/document type.
2. Query project and public notebooks separately with `chat_ask(notebook, question, source_ids)`; never mix IDs from different notebooks.
3. Merge the answers while preserving notebook ID, source ID/title, and citations.
4. Prefer exact part-number applicability and the newest verified vendor revision. Treat errata as an amendment to the matching manual, not as a generic replacement.

When sources conflict, rank evidence in this order: applicable manufacturer errata; applicable manufacturer datasheet/reference manual; manufacturer application or hardware guide; project-specific verified experience; provisional experience; third-party material. Then compare document number, supported part/revision, publication revision, and circuit conditions. State unresolved conflicts and ask for a decision when the answer would change implementation or hardware behavior.

## Save experience

Create or update an experience Note only when the user explicitly asks to save it, or explicitly accepts a proposed capture after one of these events:

- a reproducible bring-up/debug result;
- a confirmed workaround for silicon, toolchain, or board behavior;
- a reusable configuration rule with applicability and evidence;
- a project decision that materially changes later document interpretation.

Use `verified` only with reproducible evidence or authoritative confirmation. Otherwise use `provisional`. Include subject/part number, scope, symptoms or goal, conditions, conclusion, evidence/citations, applicability, and status. Use `note_save`; keep only the returned Note binding in the local index, not the Note body.
