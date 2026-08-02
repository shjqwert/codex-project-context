import type { ProjectAnalysisLine, ProjectContext, ProjectResource } from "../types.js";

export const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
export const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";

export function renderManagedAgentsSection(context: ProjectContext): string {
  const analysis = context.analysis;
  if (analysis === undefined) {
    throw new Error("Project context does not contain Agent-authored analysis; run project-sync with a current analysis input.");
  }
  const resources = analysis.references.filter((resource) => !isOpenSpecResource(resource)).slice(0, 12);
  const handoffContextEntries = context.handoffIndex === ".agent/handoff/index.json"
    ? ["- `.agent/handoff/`: cross-task handoff index and records."]
    : [
        `- \`${context.handoffIndex}\`: cross-task handoff index.`,
        "- `.agent/handoff/records/`: cross-task handoff records.",
      ];
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
    "- `.agent/context.json`: stable project metadata and context configuration.",
    "- `.agent/planMsg.md`: confirmed project-level plans and key decisions, created only when needed.",
    ...handoffContextEntries,
    "",
    "## Handoff Context",
    "",
    "- Create a handoff only when coherent work must continue in another task; skip routine questions and one-off small changes.",
    ...(analysis.handoffGuidance.length === 0
      ? ["- Query the handoff index using reliable evidence from the current task, then read every reliably relevant record."]
      : renderAnalysisLines(analysis.handoffGuidance)),
    "- If no reliable match exists, continue from the current project without forcing historical context or reading unrelated records.",
    "- Use handoffs only to restore the objective, confirmed progress, verification, remaining work, and risks; current code, configuration, references, and test evidence remain authoritative.",
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
