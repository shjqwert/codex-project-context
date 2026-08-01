import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ProjectCapabilities,
  ProjectContext,
  ProjectProfile,
  ProjectResource,
  ProjectResourceKind,
} from "../types.js";
import {
  assertDirectory,
  findProjectRoot,
  pathExists,
  readJson,
  readJsonIfPresent,
  readTextIfPresent,
  writeJsonAtomic,
  writeTextAtomic,
} from "../infrastructure/files.js";
import { EMPTY_HANDOFF_INDEX, normalizeHandoffIndex } from "./handoff-index.js";
import {
  countDocumentLines,
  renderManagedAgentsSection,
  upsertManagedAgentsSection,
} from "./agents-document.js";
import { discoverProject } from "./project-discovery.js";

export interface ProjectUpdateResult {
  ok: true;
  action: "initialized" | "synchronized";
  projectRoot: string;
  contextPath: string;
  handoffIndexPath: string;
  agentsPath: string;
  capabilities: ProjectCapabilities;
  profile: ProjectProfile;
  resourceCount: number;
}

export async function initializeProject(projectDirectory: string): Promise<ProjectUpdateResult> {
  const projectRoot = resolve(projectDirectory);
  await assertDirectory(projectRoot);

  const contextPath = resolve(projectRoot, ".agent", "context.json");
  const stored = await readJsonIfPresent<unknown>(contextPath);
  const existing = stored === undefined ? undefined : validateStoredContext(projectRoot, stored);
  const context = await buildContext(projectRoot, existing);
  const indexPath = resolve(projectRoot, context.handoffIndex);

  await writeJsonAtomic(contextPath, context);
  if (!(await pathExists(indexPath))) {
    await writeJsonAtomic(indexPath, EMPTY_HANDOFF_INDEX);
  } else {
    await migrateIndexIfNeeded(indexPath);
  }
  const agentsPath = await updateManagedAgentsSection(projectRoot, context);

  return {
    ok: true,
    action: "initialized",
    projectRoot,
    contextPath,
    handoffIndexPath: indexPath,
    agentsPath,
    capabilities: context.capabilities,
    profile: context.profile!,
    resourceCount: context.resources?.length ?? 0,
  };
}

export async function synchronizeProject(projectDirectory: string): Promise<ProjectUpdateResult> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const contextPath = resolve(projectRoot, ".agent", "context.json");
  const existing = await readProjectContext(projectRoot);
  const context = await buildContext(projectRoot, existing);
  const indexPath = resolve(projectRoot, context.handoffIndex);

  await writeJsonAtomic(contextPath, context);
  if (!(await pathExists(indexPath))) {
    await writeJsonAtomic(indexPath, EMPTY_HANDOFF_INDEX);
  } else {
    await migrateIndexIfNeeded(indexPath);
  }
  const agentsPath = await updateManagedAgentsSection(projectRoot, context);

  return {
    ok: true,
    action: "synchronized",
    projectRoot,
    contextPath,
    handoffIndexPath: indexPath,
    agentsPath,
    capabilities: context.capabilities,
    profile: context.profile!,
    resourceCount: context.resources?.length ?? 0,
  };
}

export async function getProjectStatus(projectDirectory: string): Promise<Record<string, unknown>> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const contextPath = resolve(projectRoot, ".agent", "context.json");
  const context = await readProjectContext(projectRoot);
  const { index } = normalizeHandoffIndex(
    await readJson<unknown>(resolve(projectRoot, context.handoffIndex)),
  );

  return {
    ok: true,
    plugin: "codex-project-context",
    projectRoot,
    context,
    handoffCount: index.entries.length,
  };
}

async function migrateIndexIfNeeded(indexPath: string): Promise<void> {
  const normalized = normalizeHandoffIndex(await readJson<unknown>(indexPath));
  if (normalized.migrated) await writeJsonAtomic(indexPath, normalized.index);
}

export async function requireProjectRoot(startDirectory: string): Promise<string> {
  const projectRoot = await findProjectRoot(startDirectory);
  if (projectRoot === undefined) {
    throw new Error(`No .agent/context.json found from ${resolve(startDirectory)} upward.`);
  }
  return projectRoot;
}

export async function readProjectContext(projectRoot: string): Promise<ProjectContext> {
  const stored = await readJson<unknown>(resolve(projectRoot, ".agent", "context.json"));
  return validateStoredContext(projectRoot, stored);
}

async function buildContext(
  projectRoot: string,
  existing: ProjectContext | undefined,
): Promise<ProjectContext> {
  const [capabilities, discovery] = await Promise.all([
    detectCapabilities(projectRoot),
    discoverProject(projectRoot),
  ]);
  return {
    schemaVersion: 1,
    projectRoot: ".",
    currentCycle: existing?.currentCycle ?? "development",
    agentsFile: existing?.agentsFile ?? "AGENTS.md",
    handoffIndex: existing?.handoffIndex ?? ".agent/handoff/index.json",
    capabilities,
    profile: discovery.profile,
    resources: discovery.resources,
  };
}

function validateStoredContext(projectRoot: string, value: unknown): ProjectContext {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.projectRoot !== ".") {
    throw new Error("Unsupported or invalid project context.");
  }
  if (typeof value.currentCycle !== "string" || value.currentCycle.trim().length === 0) {
    throw new Error("Project context currentCycle must be a non-empty string.");
  }
  if (!isRecord(value.capabilities)) {
    throw new Error("Project context capabilities must be an object.");
  }

  const { codegraph, serena, openspec } = value.capabilities;
  if (typeof codegraph !== "boolean" || typeof serena !== "boolean" || typeof openspec !== "boolean") {
    throw new Error("Project context capabilities must contain boolean codegraph, serena, and openspec fields.");
  }

  const profile = value.profile === undefined ? undefined : validateProfile(projectRoot, value.profile);
  const resources = value.resources === undefined ? undefined : validateResources(projectRoot, value.resources);
  return {
    schemaVersion: 1,
    projectRoot: ".",
    currentCycle: value.currentCycle.trim(),
    agentsFile: validateProjectPath(projectRoot, value.agentsFile, "agentsFile"),
    handoffIndex: validateProjectPath(projectRoot, value.handoffIndex, "handoffIndex"),
    capabilities: {
      codegraph,
      serena,
      openspec,
    },
    ...(profile === undefined ? {} : { profile }),
    ...(resources === undefined ? {} : { resources }),
  };
}

function validateProfile(projectRoot: string, value: unknown): ProjectProfile {
  if (!isRecord(value)) {
    throw new Error("Project context profile must be an object.");
  }
  return {
    name: requiredContextText(value.name, "profile name"),
    projectTypes: contextStringArray(value.projectTypes, "projectTypes"),
    languages: contextStringArray(value.languages, "languages"),
    sourceDirectories: contextStringArray(value.sourceDirectories, "sourceDirectories").map((path) =>
      validateProjectPath(projectRoot, path, "sourceDirectories entry"),
    ),
    testDirectories: contextStringArray(value.testDirectories, "testDirectories").map((path) =>
      validateProjectPath(projectRoot, path, "testDirectories entry"),
    ),
    specificationDirectories: contextStringArray(
      value.specificationDirectories ?? [],
      "specificationDirectories",
    ).map((path) => validateProjectPath(projectRoot, path, "specificationDirectories entry")),
  };
}

function validateResources(projectRoot: string, value: unknown): ProjectResource[] {
  if (!Array.isArray(value)) throw new Error("Project context resources must be an array.");
  const kinds = new Set<ProjectResourceKind>([
    "documentation",
    "manual",
    "hardware",
    "specification",
    "test",
  ]);
  return value.map((resource) => {
    if (!isRecord(resource) || typeof resource.kind !== "string" || !kinds.has(resource.kind as ProjectResourceKind)) {
      throw new Error("Project context resources contain an invalid kind.");
    }
    return {
      kind: resource.kind as ProjectResourceKind,
      path: validateProjectPath(projectRoot, resource.path, "resource path"),
      purpose: requiredContextText(resource.purpose, "resource purpose"),
    };
  });
}

function contextStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Project context ${field} must be a string array.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function requiredContextText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Project context ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function validateProjectPath(projectRoot: string, value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || isAbsolute(value)) {
    throw new Error(`Project context ${field} must be a non-empty project-relative path.`);
  }

  const absolute = resolve(projectRoot, value);
  const rootPrefix = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;
  if (absolute === projectRoot || !absolute.startsWith(rootPrefix)) {
    throw new Error(`Project context ${field} must stay inside the project root.`);
  }
  return relative(projectRoot, absolute).replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function detectCapabilities(projectRoot: string): Promise<ProjectCapabilities> {
  return {
    codegraph: await pathExists(resolve(projectRoot, ".codegraph")),
    serena: await pathExists(resolve(projectRoot, ".serena")),
    openspec:
      (await pathExists(resolve(projectRoot, "openspec"))) ||
      (await pathExists(resolve(projectRoot, ".openspec"))),
  };
}

async function updateManagedAgentsSection(
  projectRoot: string,
  context: ProjectContext,
): Promise<string> {
  const agentsPath = resolve(projectRoot, context.agentsFile);
  const current = (await readTextIfPresent(agentsPath)) ?? "";
  const managed = renderManagedAgentsSection(context);
  const managedLineCount = countDocumentLines(managed);
  if (managedLineCount > 200) {
    throw new Error(`Generated AGENTS.md managed section must contain at most 200 lines; received ${managedLineCount}.`);
  }
  const next = upsertManagedAgentsSection(current, managed);
  await writeTextAtomic(agentsPath, next);
  return agentsPath;
}
