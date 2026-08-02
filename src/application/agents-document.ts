import type { ProjectAnalysisLine, ProjectContext, ProjectResource } from "../types.js";

export const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
export const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";

export function renderManagedAgentsSection(context: ProjectContext): string {
  const analysis = context.analysis;
  if (analysis === undefined) {
    throw new Error("Project context does not contain Agent-authored analysis; run project-sync with a current analysis input.");
  }
  const resources = analysis.references.filter((resource) => !isOpenSpecResource(resource)).slice(0, 12);
  const lines = [
    MANAGED_START,
    "# Project Agent Instructions",
    "",
    "This managed section is the stable execution map for Codex in this project.",
    "Use current code, configuration, specifications, and observed test output as evidence; never invent missing project facts.",
    "",
    "## Project Overview",
    "",
    ...renderAnalysisLines(analysis.overview),
    "",
    "## Build and Verification",
    "",
    ...renderAnalysisLines(analysis.buildAndVerification),
    "",
    "## Code Analysis",
    "",
    ...renderAnalysisLines(analysis.codeAnalysis),
    "",
    ...renderProjectReferences(resources, analysis.referenceGuidance),
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
    ...(analysis.handoffSubjects.length === 0
      ? ["- When coherent project work must continue in another window, create a handoff record."]
      : [`- Create a handoff when coherent work involving ${analysis.handoffSubjects.join(", ")} must continue in another window.`]),
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

function renderAnalysisLines(lines: ProjectAnalysisLine[]): string[] {
  return lines.map((line) => `- ${line.text}`);
}

function renderProjectReferences(
  resources: ProjectResource[],
  guidance: ProjectAnalysisLine[],
): string[] {
  if (resources.length === 0) return [];
  return [
    "## Project References",
    "",
    ...resources.map((resource) => `- ${resource.kind}: \`${resource.path}\` — ${resource.purpose}`),
    ...(guidance.length === 0 ? [] : ["", ...renderAnalysisLines(guidance)]),
    "",
  ];
}

function isOpenSpecResource(resource: ProjectResource): boolean {
  const segments = resource.path.toLocaleLowerCase().replaceAll("\\", "/").split("/");
  return segments.includes("openspec") || segments.includes(".openspec");
}
