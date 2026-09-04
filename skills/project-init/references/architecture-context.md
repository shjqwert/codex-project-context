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
