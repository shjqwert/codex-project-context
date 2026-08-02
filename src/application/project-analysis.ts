import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ProjectAdvisory,
  ProjectAdvisoryKind,
  ProjectAnalysisDraft,
  ProjectAnalysisLine,
  ProjectAnalysisReference,
  ProjectInventory,
  ProjectResourceKind,
} from "../types.js";
import { pathExists } from "../infrastructure/files.js";

const RESOURCE_KINDS = new Set<ProjectResourceKind>([
  "documentation",
  "manual",
  "hardware",
  "specification",
  "test",
]);
const ADVISORY_KINDS = new Set<ProjectAdvisoryKind>([
  "missing-reference",
  "unconfirmed-fact",
  "configuration-conflict",
]);

export async function validateProjectAnalysisDraft(
  projectRoot: string,
  inventory: ProjectInventory,
  value: unknown,
): Promise<ProjectAnalysisDraft> {
  const draft = validateStoredProjectAnalysis(value);
  if (draft.inventoryFingerprint !== inventory.fingerprint) {
    throw new Error("Project analysis input is stale; run inspect again before initializing or synchronizing.");
  }

  const evidencePaths = new Set<string>();
  for (const line of [...draft.overview, ...draft.buildAndVerification, ...draft.codeAnalysis, ...draft.referenceGuidance]) {
    for (const path of line.evidencePaths) evidencePaths.add(path);
  }
  for (const reference of draft.references) {
    evidencePaths.add(reference.path);
    for (const path of reference.evidencePaths) evidencePaths.add(path);
  }
  for (const advisory of draft.advisories) {
    for (const path of advisory.evidencePaths) evidencePaths.add(path);
  }
  for (const path of evidencePaths) await requireExistingEvidencePath(projectRoot, path);
  return draft;
}

export function validateStoredProjectAnalysis(value: unknown): ProjectAnalysisDraft {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Project analysis input must use schemaVersion 1.");
  }
  const inventoryFingerprint = requiredSingleLine(value.inventoryFingerprint, "inventoryFingerprint", 200);

  const draft: ProjectAnalysisDraft = {
    schemaVersion: 1,
    inventoryFingerprint,
    overview: analysisLines(value.overview, "overview", 1, 16),
    buildAndVerification: analysisLines(value.buildAndVerification, "buildAndVerification", 1, 3),
    codeAnalysis: analysisLines(value.codeAnalysis, "codeAnalysis", 1, 8),
    references: analysisReferences(value.references),
    referenceGuidance: analysisLines(value.referenceGuidance ?? [], "referenceGuidance", 0, 8),
    handoffSubjects: singleLineArray(value.handoffSubjects ?? [], "handoffSubjects", 12, 100),
    advisories: analysisAdvisories(value.advisories ?? []),
  };
  return draft;
}

function analysisLines(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): ProjectAnalysisLine[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`Project analysis ${field} must contain between ${minimum} and ${maximum} entries.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Project analysis ${field}[${index}] must be an object.`);
    const evidencePaths = evidencePathArray(entry.evidencePaths, `${field}[${index}].evidencePaths`);
    if (evidencePaths.length === 0) {
      throw new Error(`Project analysis ${field}[${index}] must cite at least one evidence path.`);
    }
    return {
      text: requiredSingleLine(entry.text, `${field}[${index}].text`, 500),
      evidencePaths,
    };
  });
}

function analysisReferences(value: unknown): ProjectAnalysisReference[] {
  if (!Array.isArray(value) || value.length > 24) {
    throw new Error("Project analysis references must be an array with at most 24 entries.");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.kind !== "string" || !RESOURCE_KINDS.has(entry.kind as ProjectResourceKind)) {
      throw new Error(`Project analysis references[${index}] has an invalid kind.`);
    }
    const path = projectRelativePath(entry.path, `references[${index}].path`, false);
    if (isOpenSpecPath(path)) {
      throw new Error(`Project analysis references[${index}] must not expose OpenSpec-owned paths.`);
    }
    const evidencePaths = evidencePathArray(entry.evidencePaths, `references[${index}].evidencePaths`);
    if (evidencePaths.length === 0) {
      throw new Error(`Project analysis references[${index}] must cite at least one evidence path.`);
    }
    return {
      kind: entry.kind as ProjectResourceKind,
      path,
      purpose: requiredSingleLine(entry.purpose, `references[${index}].purpose`, 500),
      evidencePaths,
    };
  });
}

function analysisAdvisories(value: unknown): ProjectAdvisory[] {
  if (!Array.isArray(value) || value.length > 16) {
    throw new Error("Project analysis advisories must be an array with at most 16 entries.");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.kind !== "string" || !ADVISORY_KINDS.has(entry.kind as ProjectAdvisoryKind)) {
      throw new Error(`Project analysis advisories[${index}] has an invalid kind.`);
    }
    if (entry.action !== "remind-user" && entry.action !== "none") {
      throw new Error(`Project analysis advisories[${index}] has an invalid action.`);
    }
    return {
      kind: entry.kind as ProjectAdvisoryKind,
      subject: requiredSingleLine(entry.subject, `advisories[${index}].subject`, 200),
      reason: requiredSingleLine(entry.reason, `advisories[${index}].reason`, 500),
      action: entry.action,
      evidencePaths: evidencePathArray(entry.evidencePaths, `advisories[${index}].evidencePaths`),
    };
  });
}

function evidencePathArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 16 || value.some((item) => typeof item !== "string")) {
    throw new Error(`Project analysis ${field} must be a string array with at most 16 entries.`);
  }
  return [...new Set(value.map((item) => projectRelativePath(item, field, true)))];
}

function singleLineArray(value: unknown, field: string, maximum: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`Project analysis ${field} must be an array with at most ${maximum} entries.`);
  }
  return [...new Set(value.map((entry, index) => requiredSingleLine(entry, `${field}[${index}]`, maximumLength)))];
}

function requiredSingleLine(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`Project analysis ${field} must be a string.`);
  const text = value.normalize("NFKC").trim().replace(/^[-*]\s+/u, "");
  if (text.length === 0 || text.length > maximumLength || /[\r\n]/u.test(text) || text.startsWith("#") || text.includes("<!--")) {
    throw new Error(`Project analysis ${field} must be a bounded single line without Markdown headings or markers.`);
  }
  return text;
}

function projectRelativePath(value: unknown, field: string, allowRoot: boolean): string {
  if (typeof value !== "string" || value.trim().length === 0 || isAbsolute(value)) {
    throw new Error(`Project analysis ${field} must be a project-relative path.`);
  }
  const normalized = value.trim().replaceAll("\\", "/");
  if (allowRoot && normalized === ".") return ".";
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Project analysis ${field} must stay inside the project root.`);
  }
  return normalized.replace(/^\.\//u, "");
}

async function requireExistingEvidencePath(projectRoot: string, projectPath: string): Promise<void> {
  const absolute = projectPath === "." ? projectRoot : resolve(projectRoot, projectPath);
  const rootPrefix = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;
  if (absolute !== projectRoot && !absolute.startsWith(rootPrefix)) {
    throw new Error(`Project analysis evidence path must stay inside the project root: ${projectPath}`);
  }
  if (!(await pathExists(absolute))) {
    throw new Error(`Project analysis evidence path does not exist: ${projectPath}`);
  }
  if (projectPath !== ".") {
    const durable = relative(projectRoot, absolute).replaceAll("\\", "/");
    if (durable !== projectPath) throw new Error(`Project analysis evidence path is not normalized: ${projectPath}`);
  }
}

function isOpenSpecPath(path: string): boolean {
  const segments = path.toLocaleLowerCase().split("/");
  return segments.includes("openspec") || segments.includes(".openspec");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
