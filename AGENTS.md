<!-- PROJECT_CONTEXT_START -->
# Project Agent Instructions

This managed section is the stable execution map for Codex in this project.
Use current code, configuration, specifications, and observed test output as evidence; never invent missing project facts.

## Project Overview

- This repository implements the codex-project-context Codex plugin for durable project guidance, project plans, and cross-task handoffs.
- The implementation targets Node.js 20 or later, uses strict TypeScript under src, and keeps automated coverage under tests.
- The plugin bundles explicit project initialization and synchronization Skills plus implicit-capable handoff and project-plan Skills.
- The plugin integrates SessionStart and UserPromptSubmit lifecycle Hooks for concise context routing and handoff matching.

## Build and Verification

- Do not build, package, install, or publish the plugin unless the user explicitly requests that operation.
- When verification is requested, start with tests for the changed application, Hook, Skill, or schema surface and use the full suite for release or publish validation.

## Code Analysis

- Use Serena for symbol lookup, reference analysis, focused reading, and precise edits when available in this repository.
- Route durable context behavior through src/application, lifecycle integration through src/hooks, commands through src/cli, and shared contracts through src/types.ts and schemas.
- Use the matching test surface under tests for the affected capability; if Serena is unavailable, continue with focused source reading and normal repository search.

## Project References

- documentation: `README.md` — User-facing capabilities, installation, packaging, Hook trust, and CLI usage.
- documentation: `CHANGELOG.zh-CN.md` — Versioned project change notes and compatibility context.
- documentation: `skills/project-init/references` — Project discovery and generated AGENTS structure contracts used by initialization and synchronization.
- documentation: `skills/project-handoff/references` — Handoff record, index, aliases, grouping, deduplication, and retrieval contracts.
- test: `tests` — Automated verification for CLI, Hooks, matching, project context, plans, schemas, and plugin shape.

- Read README.md for user-visible or installation changes, and open only the Skill reference and tests relevant to the capability being changed.


## Project Context

- `.agent/context.json`: stable project metadata and context configuration.
- `.agent/planMsg.md`: confirmed project-level plans and key decisions, created only when needed.
- `.agent/handoff/`: cross-task handoff index and records.

## Handoff Context

- Create a handoff only when coherent work must continue in another task; skip routine questions and one-off small changes.
- Route continuation by the affected capability, including initialization, synchronization, plans, handoffs, Hooks, BM25, or bilingual aliases.
- Use source files, exported symbols, schemas, Skill names, Hook names, and focused test names as retrieval evidence.
- For packaging and installation continuation, include the package manifest and local marketplace preparation script in the evidence set.
- If no reliable match exists, continue from the current project without forcing historical context or reading unrelated records.
- Use handoffs only to restore the objective, confirmed progress, verification, remaining work, and risks; current code, configuration, references, and test evidence remain authoritative.
<!-- PROJECT_CONTEXT_END -->
