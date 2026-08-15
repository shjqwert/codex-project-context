import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ProjectAdvisory,
  ProjectAnalysisDraft,
  ProjectCapabilities,
  ProjectContext,
  ProjectInventory,
  ProjectProfile,
  ProjectResource,
  ProjectResourceKind,
  SolAdvisorImplicitDelegationAction,
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
import { withProjectWriteLock } from "../infrastructure/project-write-lock.js";
import {
  validateProjectAnalysisDraft,
  validateStoredProjectAnalysis,
} from "./project-analysis.js";
import { EMPTY_HANDOFF_INDEX, validateHandoffIndex } from "./handoff-index.js";
import {
  countDocumentLines,
  removeLegacyExperimentalIndexEntry,
  renderManagedAgentsSection,
  updateManagedSolAdvisorAuthorization,
  upsertManagedAgentsSection,
} from "./agents-document.js";
import { inspectProject } from "./project-discovery.js";
import {
  PROJECT_AUTHORIZATIONS_PATH,
  readProjectAuthorizations,
  removeProjectAuthorizations,
  writeSolAdvisorImplicitDelegationAuthorization,
} from "./project-authorizations.js";

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
  inventoryFingerprint: string;
  advisories: ProjectAdvisory[];
  solAdvisorImplicitDelegation: boolean;
}

export interface ProjectAuthorizationResult {
  ok: true;
  action: "enabled" | "removed";
  projectRoot: string;
  authorizationPath: string;
  agentsPath: string;
  solAdvisorImplicitDelegation: boolean;
}

export interface ProjectInitializationOptions {
  solAdvisorImplicitDelegation?: boolean;
}

export async function initializeProject(
  projectDirectory: string,
  rawAnalysis: unknown,
  options: ProjectInitializationOptions = {},
): Promise<ProjectUpdateResult> {
  const projectRoot = resolve(projectDirectory);
  await assertDirectory(projectRoot);
  return withProjectWriteLock(projectRoot, async () => {
    const contextPath = resolve(projectRoot, ".agent", "context.json");
    const stored = await readJsonIfPresent<unknown>(contextPath);
    const existing = stored === undefined ? undefined : validateStoredContext(projectRoot, stored);
    await readProjectAuthorizations(projectRoot);
    const inventory = await inspectProject(projectRoot);
    requireCompleteInventory(inventory);
    const analysis = await validateProjectAnalysisDraft(projectRoot, inventory, rawAnalysis);
    const context = buildContext(existing, inventory, analysis);
    const indexPath = resolve(projectRoot, context.handoffIndex);

    const indexExists = await pathExists(indexPath);
    if (indexExists) validateHandoffIndex(await readJson<unknown>(indexPath));
    if (!indexExists && await pathExists(resolve(projectRoot, ".agent", "handoff", "records"))) {
      throw new Error("Handoff index is missing while records exist; rebuild the index before initialization.");
    }
    const solAdvisorImplicitDelegation = options.solAdvisorImplicitDelegation !== false;
    const preparedAgents = await prepareManagedAgentsSection(
      projectRoot,
      context,
      solAdvisorImplicitDelegation,
    );

    await writeJsonAtomic(contextPath, context);
    if (!indexExists) {
      await writeJsonAtomic(indexPath, EMPTY_HANDOFF_INDEX);
    }
    if (solAdvisorImplicitDelegation) {
      await writeSolAdvisorImplicitDelegationAuthorization(projectRoot);
    } else {
      await removeProjectAuthorizations(projectRoot);
    }
    await writeTextAtomic(preparedAgents.agentsPath, preparedAgents.next);

    return {
      ok: true,
      action: "initialized",
      projectRoot,
      contextPath,
      handoffIndexPath: indexPath,
      agentsPath: preparedAgents.agentsPath,
      capabilities: context.capabilities,
      profile: context.profile!,
      resourceCount: context.resources?.length ?? 0,
      inventoryFingerprint: inventory.fingerprint,
      advisories: analysis.advisories,
      solAdvisorImplicitDelegation,
    };
  });
}

export async function synchronizeProject(
  projectDirectory: string,
  rawAnalysis: unknown,
): Promise<ProjectUpdateResult> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const contextPath = resolve(projectRoot, ".agent", "context.json");
    const existing = await readProjectContext(projectRoot);
    const authorizations = await readProjectAuthorizations(projectRoot);
    const inventory = await inspectProject(projectRoot);
    requireCompleteInventory(inventory);
    const analysis = await validateProjectAnalysisDraft(projectRoot, inventory, rawAnalysis);
    const context = buildContext(existing, inventory, analysis);
    const indexPath = resolve(projectRoot, context.handoffIndex);

    const indexExists = await pathExists(indexPath);
    if (indexExists) validateHandoffIndex(await readJson<unknown>(indexPath));
    if (!indexExists && await pathExists(resolve(projectRoot, ".agent", "handoff", "records"))) {
      throw new Error("Handoff index is missing while records exist; rebuild the index before synchronization.");
    }
    await writeJsonAtomic(contextPath, context);
    if (!indexExists) {
      await writeJsonAtomic(indexPath, EMPTY_HANDOFF_INDEX);
    }
    const solAdvisorImplicitDelegation = authorizations !== undefined;
    const agentsPath = await updateManagedAgentsSection(projectRoot, context, solAdvisorImplicitDelegation);

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
      inventoryFingerprint: inventory.fingerprint,
      advisories: analysis.advisories,
      solAdvisorImplicitDelegation,
    };
  });
}

function requireCompleteInventory(inventory: ProjectInventory): void {
  if (!inventory.scan.truncated) return;
  throw new Error(
    `Project inventory is incomplete: ${inventory.scan.truncationReasons.join(", ")}.`,
  );
}

export async function getProjectStatus(projectDirectory: string): Promise<Record<string, unknown>> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const contextPath = resolve(projectRoot, ".agent", "context.json");
  const context = await readProjectContext(projectRoot);
  const authorizations = await readProjectAuthorizations(projectRoot);
  const index = validateHandoffIndex(await readJson<unknown>(resolve(projectRoot, context.handoffIndex)));

  return {
    ok: true,
    plugin: "codex-project-context",
    projectRoot,
    context,
    authorizations: authorizations ?? null,
    solAdvisorImplicitDelegation: authorizations !== undefined,
    handoffCount: index.entries.length,
  };
}

export async function configureSolAdvisorImplicitDelegation(
  projectDirectory: string,
  action: SolAdvisorImplicitDelegationAction,
): Promise<ProjectAuthorizationResult> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const context = await readProjectContext(projectRoot);
    await readProjectAuthorizations(projectRoot);
    const enabled = action === "enable";
    const preparedAgents = await prepareManagedAgentsSection(projectRoot, context, enabled);
    const authorizationPath = resolve(projectRoot, PROJECT_AUTHORIZATIONS_PATH);

    if (enabled) {
      await writeSolAdvisorImplicitDelegationAuthorization(projectRoot);
      await writeTextAtomic(preparedAgents.agentsPath, preparedAgents.next);
    } else {
      await writeTextAtomic(preparedAgents.agentsPath, preparedAgents.next);
      await removeProjectAuthorizations(projectRoot);
    }

    return {
      ok: true,
      action: enabled ? "enabled" : "removed",
      projectRoot,
      authorizationPath,
      agentsPath: preparedAgents.agentsPath,
      solAdvisorImplicitDelegation: enabled,
    };
  });
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

function buildContext(
  existing: ProjectContext | undefined,
  inventory: ProjectInventory,
  analysis: ProjectAnalysisDraft,
): ProjectContext {
  return {
    schemaVersion: 2,
    projectRoot: ".",
    currentCycle: existing?.currentCycle ?? "development",
    agentsFile: existing?.agentsFile ?? "AGENTS.md",
    handoffIndex: existing?.handoffIndex ?? ".agent/handoff/index.json",
    capabilities: inventory.capabilities,
    profile: inventory.profile,
    resources: analysis.references.map(({ kind, path, purpose }) => ({ kind, path, purpose })),
    inventoryFingerprint: inventory.fingerprint,
    analysis,
  };
}

function validateStoredContext(projectRoot: string, value: unknown): ProjectContext {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.projectRoot !== ".") {
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
  const analysis = value.analysis === undefined ? undefined : validateStoredProjectAnalysis(value.analysis);
  const inventoryFingerprint = value.inventoryFingerprint === undefined
    ? undefined
    : requiredContextText(value.inventoryFingerprint, "inventoryFingerprint");
  if (value.schemaVersion === 2 && (analysis === undefined || inventoryFingerprint === undefined)) {
    throw new Error("Project context schemaVersion 2 requires inventoryFingerprint and analysis.");
  }
  return {
    schemaVersion: value.schemaVersion,
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
    ...(inventoryFingerprint === undefined ? {} : { inventoryFingerprint }),
    ...(analysis === undefined ? {} : { analysis }),
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

async function updateManagedAgentsSection(
  projectRoot: string,
  context: ProjectContext,
  solAdvisorImplicitDelegation: boolean,
): Promise<string> {
  const prepared = await prepareManagedAgentsSection(projectRoot, context, solAdvisorImplicitDelegation);
  await writeTextAtomic(prepared.agentsPath, prepared.next);
  return prepared.agentsPath;
}

async function prepareManagedAgentsSection(
  projectRoot: string,
  context: ProjectContext,
  solAdvisorImplicitDelegation: boolean,
): Promise<{ agentsPath: string; next: string }> {
  const agentsPath = resolve(projectRoot, context.agentsFile);
  const current = (await readTextIfPresent(agentsPath)) ?? "";
  if (context.analysis === undefined) {
    return {
      agentsPath,
      next: removeLegacyExperimentalIndexEntry(
        updateManagedSolAdvisorAuthorization(current, solAdvisorImplicitDelegation),
      ),
    };
  }
  const managed = renderManagedAgentsSection(context, {
    solAdvisorImplicitDelegation,
  });
  const managedLineCount = countDocumentLines(managed);
  if (managedLineCount > 200) {
    throw new Error(`Generated AGENTS.md managed section must contain at most 200 lines; received ${managedLineCount}.`);
  }
  const next = upsertManagedAgentsSection(current, managed);
  return { agentsPath, next };
}
