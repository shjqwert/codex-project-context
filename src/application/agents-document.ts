import type {
  ProjectAnalysisLine,
  ProjectContext,
  ProjectResource,
  SolAdvisorDelegationPolicy,
} from "../types.js";

export const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
export const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";

export interface ManagedAgentsOptions {
  solAdvisorDelegationPolicy?: SolAdvisorDelegationPolicy;
}

const SOL_ADVISOR_INTEGRATION_HEADING = "## Sol Advisor Integration";
const LEGACY_SOL_ADVISOR_HEADING = "## Subagent Orchestration";

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
    ...(context.profile?.specificationDirectories.includes("openspec")
      ? ["- `openspec/`: native specifications and Changes; use existing lifecycle documents without duplicating task state here."]
      : []),
    "",
    ...renderSolAdvisorIntegration(options.solAdvisorDelegationPolicy ?? "inherit"),
    "## Handoff Context",
    "",
    "- Create a handoff only when coherent work must continue in another task; skip routine questions and one-off small changes.",
    ...(analysis.handoffGuidance.length === 0
      ? ["- Query relevant handoff summaries first, then read only current-document sections needed for the present evidence gap."]
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

export function hasManagedSolAdvisorIntegration(current: string): boolean {
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  if (start < 0 || end < start) return false;
  return current.slice(start, end).includes(SOL_ADVISOR_INTEGRATION_HEADING);
}

export function updateManagedSolAdvisorIntegration(
  current: string,
  policy: SolAdvisorDelegationPolicy,
): string {
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
  for (const heading of [LEGACY_SOL_ADVISOR_HEADING, SOL_ADVISOR_INTEGRATION_HEADING]) {
    const headingCount = countOccurrences(managed, heading);
    if (headingCount > 1) {
      throw new Error(`AGENTS.md contains multiple ${heading.slice(3)} sections.`);
    }
    const headingIndex = managed.indexOf(heading);
    if (headingIndex >= 0) {
      const nextHeading = managed.indexOf(`${lineBreak}## `, headingIndex + heading.length);
      if (nextHeading < 0) {
        throw new Error(`AGENTS.md ${heading.slice(3)} section has no following managed heading.`);
      }
      managed = `${managed.slice(0, headingIndex)}${managed.slice(nextHeading + lineBreak.length)}`;
    }
  }

  const insertionHeading = "## Handoff Context";
  const insertionIndex = managed.indexOf(insertionHeading);
  if (insertionIndex < 0) {
    throw new Error("Legacy project-context managed section has no Handoff Context heading; run project-sync with a current analysis input.");
  }
  const integration = renderSolAdvisorIntegration(policy).join(lineBreak);
  managed = `${managed.slice(0, insertionIndex)}${integration}${lineBreak}${managed.slice(insertionIndex)}`;

  return `${current.slice(0, start)}${managed}${current.slice(after)}`;
}

function renderSolAdvisorIntegration(policy: SolAdvisorDelegationPolicy): string[] {
  const policyLine = policy === "allow"
    ? "- This project explicitly allows implicit Sol Advisor delegation, subject to the installed Skill's quality and benefit gates."
    : policy === "deny"
      ? "- This project disables implicit Sol Advisor delegation; do not create a Sol Advisor child unless the current user explicitly requests it."
      : "- This project inherits global Sol Advisor eligibility, subject to the installed Skill's quality and benefit gates.";
  return [
    SOL_ADVISOR_INTEGRATION_HEADING,
    "",
    policyLine,
    "- Policy comes from schema-v1 `.agent/authorizations.json`: a missing file or key inherits the global default, `true` allows, and `false` disables implicit delegation.",
    "- Invalid or unreadable policy fails closed to primary-only work; explicit current-user instructions override project defaults.",
    "- Eligibility does not require delegation. The installed Advisor owns role and model selection; keep direct work local when delegation has no independent benefit.",
    "- Sol Advisor may read this policy but must not modify `AGENTS.md` or any `.agent` context, authorization, plan, or handoff file.",
    "- If Sol Advisor or a required route is unavailable or quota-limited, end any child ownership, inspect existing work, and continue in the primary session without impersonating that route or blocking ordinary project work.",
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
