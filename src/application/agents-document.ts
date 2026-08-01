import type { ProjectContext, ProjectProfile, ProjectResource } from "../types.js";

export const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
export const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";

const UNKNOWN_PROFILE: ProjectProfile = {
  name: "Unknown project",
  projectTypes: [],
  languages: [],
  sourceDirectories: [],
  testDirectories: [],
  specificationDirectories: [],
};

export function renderManagedAgentsSection(context: ProjectContext): string {
  const profile = context.profile ?? UNKNOWN_PROFILE;
  const resources = (context.resources ?? [])
    .filter((resource) => !isOpenSpecResource(resource))
    .slice(0, 8);
  const lines = [
    MANAGED_START,
    "# Project Agent Instructions",
    "",
    "This managed section is the stable execution map for Codex in this project.",
    "Use current code, configuration, specifications, and observed test output as evidence; never invent missing project facts.",
    "",
    "## Project Overview",
    "",
    `- Project name: ${profile.name}.`,
    `- Project root: \`${context.projectRoot}\`.`,
    `- Detected project types: ${renderValues(profile.projectTypes)}.`,
    `- Detected implementation languages: ${renderValues(profile.languages)}.`,
    `- Source directories: ${renderPaths(profile.sourceDirectories)}.`,
    `- Test directories: ${renderPaths(profile.testDirectories)}.`,
    `- Specification document directories: ${renderPaths(profile.specificationDirectories)}.`,
    "- Confirm the runtime or hardware platform from project configuration or authoritative references before relying on it.",
    "- Derive the project's core purpose from user-approved documentation and current implementation, not from directory names alone.",
    "- Treat detected metadata as navigation evidence, not as proof that every component is active.",
    "- Recheck relevant code and configuration before changing behavior.",
    "- Keep project-specific facts here stable; task progress belongs in handoffs or accepted plans.",
    "",
    "## Build and Verification",
    "",
    "- Do not compile, build, download, flash, or program the target unless the user explicitly requests it.",
    "",
    "## Code Analysis",
    "",
    "- Use CodeGraph for module relationships, call paths, and impact analysis when it is available.",
    "- Use Serena for symbol lookup, reference analysis, local reading, and precise modification when it is available.",
    "- If either tool is unavailable, continue with the project's normal tools; do not block the task or initialize tools automatically.",
    "",
    ...renderProjectReferences(resources),
    "",
    "## Project Context",
    "",
    "- `.agent/planMsg.md`: project-level key feature plans and confirmed decisions; it is not a task list.",
    `- \`${context.handoffIndex}\`: cross-window history index used for bounded routing.`,
    "- `.agent/handoff/records/`: concrete cross-window handoff records.",
    "- `.agent/context.json`: detected project metadata and plugin routing configuration.",
    "- `project-handoff` may be selected when durable cross-window continuation is needed.",
    "- `project-plan-msg` may be selected when a qualifying project-level plan is created or changes state.",
    "- Initialization must not create `.agent/planMsg.md`; create it only for the first qualifying project-level plan.",
    "- `SessionStart` injects concise routing only for initialized projects and does not write project files.",
    "- `UserPromptSubmit` queries the handoff index and returns bounded candidates instead of loading every record.",
    "- Hooks are advisory and fail open; hook failure must not block ordinary project work.",
    "- Hooks must not initialize, synchronize, create plans, create handoffs, or invoke other workflows implicitly.",
    "- Initialization and synchronization may update only plugin-owned files and the managed `AGENTS.md` section.",
    "- Treat current code, tests, and explicitly selected specifications as more authoritative than durable context files.",
    "- Keep `AGENTS.md` for stable rules and routing, not transient status, plans, or development journals.",
    "- Preserve all content outside the plugin-managed boundary markers byte-for-byte where possible.",
    "- Repeated initialization or synchronization must remain idempotent.",
    "",
    "## Handoff Context",
    "",
    "- When work must continue in another window, use the project context Skill to create a handoff record.",
    "- New windows must not read all handoff records.",
    "- Query the index first, then open only records relevant to the current feature, module, file, symbol, or bug.",
    "- Store new handoffs under `.agent/handoff/records/<cycle>/<handoff-id>-<slug>.md`.",
    "- Existing records referenced by the index remain valid even when they use an earlier storage layout.",
    "- Create a handoff only after a coherent feature, module, or bug investigation has durable continuation value.",
    "- Do not create handoffs for routine questions, trivial edits, or content already captured by an accepted specification.",
    "- The handoff index stores routing metadata and section summaries, not the full record.",
    "- Use stable identifiers, files, symbols, specification IDs, and bug IDs to match related records.",
    "- Use project-relative paths in handoff metadata so records remain portable across machines.",
    "- Keep stable frontmatter for the record ID, cycle, date, modules, files, symbols, specifications, and bug IDs.",
    "- Record confirmed work, constraints, verification, unresolved facts, risks, and supporting evidence.",
    "- Preserve failed attempts only when they prevent repeated work or constrain the next safe approach.",
    "- Do not present hypotheses as confirmed diagnosis; keep unresolved causes explicit.",
    "- Treat current code, tests, and selected specifications as more authoritative than historical handoffs.",
    "- Keep one handoff focused on one coherent feature, module, or bug context; never turn it into a development journal.",
    MANAGED_END,
  ];
  return lines.join("\n");
}

export function upsertManagedAgentsSection(current: string, managed: string): string {
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
    throw new Error("AGENTS.md contains an incomplete project-context managed section.");
  }
  if (start >= 0 && end >= 0) {
    const after = end + MANAGED_END.length;
    return `${current.slice(0, start)}${managed}${current.slice(after)}`;
  }
  if (current.length === 0) return `${managed}\n`;
  const separator = current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${separator}${managed}\n`;
}

export function countDocumentLines(content: string): number {
  return content.trimEnd().split(/\r?\n/u).length;
}

function renderValues(values: string[]): string {
  return values.length === 0 ? "not detected" : values.join(", ");
}

function renderPaths(values: string[]): string {
  return values.length === 0 ? "not detected" : values.map((value) => `\`${value}\``).join(", ");
}

function renderProjectReferences(resources: ProjectResource[]): string[] {
  if (resources.length === 0) return [];
  return [
    "## Project References",
    "",
    ...resources.map((resource) => `- ${resource.kind}: \`${resource.path}\` — ${resource.purpose}`),
    "",
    "- Reference entries record paths and intended use; they do not imply that file contents were read.",
    "- Open only the manual, schematic, hardware, test, or project document needed for the current question.",
    "- For manuals and datasheets, inspect metadata and relevant sections instead of loading the entire file.",
    "- For schematics and hardware references, preserve signal names, revisions, and board-specific constraints exactly.",
    "- If project references conflict with code, record the conflict explicitly instead of guessing.",
    "",
  ];
}

function isOpenSpecResource(resource: ProjectResource): boolean {
  const segments = resource.path.toLocaleLowerCase().replaceAll("\\", "/").split("/");
  return segments.includes("openspec") || segments.includes(".openspec");
}
