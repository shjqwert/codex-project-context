# Architecture references

Recognize architecture/baseline.md or architecture/<domain>/baseline.md as the
design-intent entry. Presence is not confirmation. Inspect declared baselineStatus
and relevant current evidence; pending-confirmation, stale or conflicting claims
must not be rendered as confirmed architecture.

Single-domain models use architecture/model.c4 and architecture/changes/.
Multi-domain models use the adjacent model.c4 and changes/ for each baseline.
A proposed or approved To-Be is not implemented As-Is. Only implementation
evidence and applicable verification support a verified-current claim.

Project Context records compact resource routing. It never creates, confirms,
rewrites or silently repairs a baseline/model. Embedded Skills own substantive
design decisions and conditional direction/structure reviews. LikeC4 remains an
external modeling dependency. Ignore .generated/ output, sites, images and layouts.

On explicit synchronization, a baseline is a confirmed current reference only
when baselineStatus is confirmed and its relevant claims and locators remain
supported. A new, moved or newly confirmed baseline requires explicit project-sync;
until then, describe generated context as stale and retain the pending action in
an applicable current handoff. Proposed, approved-but-unimplemented, partial,
failed or blocked changes do not replace the formal As-Is. Implementation state
and residual risks can be reported without claiming verified-current architecture.
Ignore root/nested .generated/ and reproducible site/, png/, layouts/, HTML, SVG,
PNG and layout JSON under architecture/ as well.
