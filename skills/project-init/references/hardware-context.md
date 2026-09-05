# Hardware document routing

No project schematic is a normal initialization state. Do not create a missing
schematic placeholder, persistent warning, empty source record or watcher.
Later additions are handled by explicit project-sync or the user's direct
schematic-analysis request, never by automatic filesystem polling.

When a real project schematic is selected during explicit initialization or sync,
use the user's explicit source identification even when the filename is generic.
Chinese names such as 原理图/电路图 and clear circuit/sch names are discovery clues,
not proof of document contents. A lone PDF or ambiguous SCM name is not automatically
a schematic; inspect a bounded title page or metadata only when needed for selection.

For the selected source,
use the available ragrepo-knowledge Skill's project-schematic reference. RAG owns
source inspection, unchanged-source reuse, changed-source processing, project-only
schematic storage, and device/public-manual applicability matching. Retain its
existing additive-ingest and separately authorized change-set apply boundaries.
Do not implement a second fingerprint, source registry or manual matcher here.

A direct analysis request selects RAG without implicitly initializing or syncing
Project Context. If RAG is unavailable, report that the selected source has not
been indexed; context initialization/sync can still finish with its real path.
Do not claim reuse or ingestion without a tool receipt. Do not bulk-process generic
PDFs, whole manuals or an entire directory because it was discovered.

Generated project AGENTS may contain the original resource entry and one concise,
evidence-backed principle: use RAG for the current task's bounded durable-document
gap and return evidence directly to the primary session. Keep source IDs, parsed
components, manual matches, processing status and knowledge bodies in RAG.
Current code is read from the repository; transient J-Link values, register
snapshots, HSS samples and capture references never enter RAG or handoffs.
