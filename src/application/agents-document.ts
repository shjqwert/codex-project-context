import type { ProjectAnalysisLine, ProjectContext, ProjectResource } from "../types.js";

export const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
export const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";

export interface ManagedAgentsOptions {
  solAdvisorImplicitDelegation?: boolean;
  notebooklmEnabled?: boolean;
}

export const NOTEBOOKLM_AGENTS_ENTRY =
  "- `.agent/notebooklm-index.json`: NotebookLM reference bindings and document-retrieval state.";

export function renderManagedAgentsSection(
  context: ProjectContext,
  options: ManagedAgentsOptions = {},
): string {
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
    ...(options.notebooklmEnabled === true ? [NOTEBOOKLM_AGENTS_ENTRY] : []),
    "",
    ...renderSolAdvisorAuthorization(options.solAdvisorImplicitDelegation === true),
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
  const startCount = countOccurrences(current, MANAGED_START);
  const endCount = countOccurrences(current, MANAGED_END);
  if (startCount > 1 || endCount > 1) {
    throw new Error("AGENTS.md contains multiple project-context managed sections.");
  }
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

export function updateManagedSolAdvisorAuthorization(current: string, enabled: boolean): string {
  const startCount = countOccurrences(current, MANAGED_START);
  const endCount = countOccurrences(current, MANAGED_END);
  if (startCount > 1 || endCount > 1) {
    throw new Error("AGENTS.md contains multiple project-context managed sections.");
  }
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  if (start < 0 || end < start || endCount !== 1) {
    throw new Error("Legacy project context requires one complete project-context managed section; run project-sync with a current analysis input.");
  }

  const after = end + MANAGED_END.length;
  const lineBreak = current.includes("\r\n") ? "\r\n" : "\n";
  let managed = current.slice(start, after);
  const heading = "## Subagent Orchestration";
  const headingCount = countOccurrences(managed, heading);
  if (headingCount > 1) {
    throw new Error("AGENTS.md contains multiple Subagent Orchestration sections.");
  }
  const headingIndex = managed.indexOf(heading);
  if (headingIndex >= 0) {
    const nextHeading = managed.indexOf(`${lineBreak}## `, headingIndex + heading.length);
    if (nextHeading < 0) {
      throw new Error("AGENTS.md Subagent Orchestration section has no following managed heading.");
    }
    managed = `${managed.slice(0, headingIndex)}${managed.slice(nextHeading + lineBreak.length)}`;
  }

  if (enabled) {
    const insertionHeading = "## Handoff Context";
    const insertionIndex = managed.indexOf(insertionHeading);
    if (insertionIndex < 0) {
      throw new Error("Legacy project-context managed section has no Handoff Context heading; run project-sync with a current analysis input.");
    }
    const authorization = renderSolAdvisorAuthorization(true).join(lineBreak);
    managed = `${managed.slice(0, insertionIndex)}${authorization}${lineBreak}${managed.slice(insertionIndex)}`;
  }

  return `${current.slice(0, start)}${managed}${current.slice(after)}`;
}

export function updateManagedNotebookLmEntry(current: string, enabled: boolean): string {
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  if (start < 0 || end < start || countOccurrences(current, MANAGED_START) !== 1 || countOccurrences(current, MANAGED_END) !== 1) {
    throw new Error("Legacy project context requires one complete project-context managed section; run project-sync with a current analysis input.");
  }
  const after = end + MANAGED_END.length;
  const lineBreak = current.includes("\r\n") ? "\r\n" : "\n";
  let managed = current.slice(start, after);
  const entryPattern = new RegExp(`(?:\\r?\\n)?${escapeRegExp(NOTEBOOKLM_AGENTS_ENTRY)}(?:\\r?\\n)?`, "gu");
  managed = managed.replace(entryPattern, lineBreak);
  if (enabled) {
    const heading = "## Project Context";
    const headingIndex = managed.indexOf(heading);
    const nextHeading = headingIndex < 0 ? -1 : managed.indexOf(`${lineBreak}## `, headingIndex + heading.length);
    if (headingIndex < 0 || nextHeading < 0) {
      throw new Error("Legacy project-context managed section has no complete Project Context section; run project-sync with a current analysis input.");
    }
    managed = `${managed.slice(0, nextHeading).trimEnd()}${lineBreak}${NOTEBOOKLM_AGENTS_ENTRY}${lineBreak}${lineBreak}${managed.slice(nextHeading + lineBreak.length)}`;
  }
  return `${current.slice(0, start)}${managed}${current.slice(after)}`;
}

function renderSolAdvisorAuthorization(enabled: boolean): string[] {
  if (!enabled) return [];
  return [
    "## Subagent Orchestration",
    "",
    "- This project authorizes implicit Sol Advisor delegation only while `.agent/authorizations.json` contains schema v1 with `authorizations.solAdvisor.implicitDelegation` exactly `true`.",
    "- Before implicit delegation, require both this managed instruction and the exact authorization value; do not infer consent from plugin availability, task shape, or either source alone.",
    "- Follow the installed Sol Advisor Skill for bounded role selection: keep complex implementation and final ownership in the primary session, prefer zero or one child, use at most two concurrent independent read-only children, keep writes serial, and prohibit descendants.",
    "- A user-owned task's transport wrapper does not count as a Sol Advisor functional child; when the Skill selects a role, the task remains responsible for creating that role.",
    "- After dispatch, do not inspect interim child output or search, read, test, or analyze the child-owned question or source scope; wait for the ordinary native final response before intake.",
    "- For a complete usable result, verify at most two decision-changing locators without repeating the investigation; after a Mechanical Editor result, inspect the full diff and run its specified check.",
    "- Use one targeted correction for an incomplete result, then fall back to the primary session; fall back immediately for a blocked or unusable result.",
    "- Two concurrent read-only children require mutually exclusive decisions, source scopes, and failure classes; overlapping evidence, shared files, or answer dependencies must remain serial.",
    "- An explicit user request to use Sol Advisor may proceed without this implicit authorization; an explicit instruction not to delegate always overrides it.",
    "- If Sol Advisor or a required role is unavailable, continue in the primary session without substitution and without blocking ordinary project work.",
    "",
  ];
}

function countOccurrences(content: string, value: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(value, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + value.length;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
