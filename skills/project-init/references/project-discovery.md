# Project Discovery Rules

## Evidence Sources

Use project-relative paths and deterministic metadata from:

- root manifests and lockfiles;
- project manifests used only to identify project type and name;
- source and test directory names;
- file extensions for language detection;
- `.codegraph/`, `.serena/`, `openspec/`, and `.openspec/` markers;
- documentation, manual, specification, schematic, and test paths.

Do not collect or publish package-manager, build, test, lint, type-check, or format commands in generated project context.

## Scan Boundary

- Scan names and metadata to a bounded depth.
- Ignore dependency caches, build output, generated output, VCS internals, and prior agent metadata.
- Do not read manual, datasheet, schematic, binary, or large reference contents during initialization.
- Cap stored resources so generated context remains concise.
- Normalize durable paths to project-relative forward-slash form.

## Classification

- Documentation: README, architecture, docs, documentation, references.
- Manual: manual, datasheet, PDF.
- Hardware: schematic, PCB, hardware, `.sch`, `.kicad_sch`, `.dsn`.
- Specification: OpenSpec, specification/spec directories, `.arxml`.
- Test: test, tests, and testing directories, excluding paths owned by OpenSpec or specification trees.

Record OpenSpec-owned `specs` paths as specification document directories, never as test directories.
Keep OpenSpec-owned paths in internal capability and specification-directory metadata, but omit them from generated `Project References` entries.

Detection is routing evidence only. A detected directory does not prove its contents are current or authoritative.
