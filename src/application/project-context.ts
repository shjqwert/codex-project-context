import { isAbsolute, relative, resolve, sep } from "node:path";
import type { HandoffIndex, ProjectCapabilities, ProjectContext } from "../types.js";
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

const MANAGED_START = "<!-- PROJECT_CONTEXT_START -->";
const MANAGED_END = "<!-- PROJECT_CONTEXT_END -->";
const DEFAULT_INDEX: HandoffIndex = { schemaVersion: 1, entries: [] };

export interface ProjectUpdateResult {
  ok: true;
  action: "initialized" | "synchronized";
  projectRoot: string;
  contextPath: string;
  handoffIndexPath: string;
  agentsPath: string;
  capabilities: ProjectCapabilities;
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
    await writeJsonAtomic(indexPath, DEFAULT_INDEX);
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
    await writeJsonAtomic(indexPath, DEFAULT_INDEX);
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
  };
}

export async function getProjectStatus(projectDirectory: string): Promise<Record<string, unknown>> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const contextPath = resolve(projectRoot, ".agent", "context.json");
  const context = await readProjectContext(projectRoot);
  const index = await readJson<HandoffIndex>(resolve(projectRoot, context.handoffIndex));

  return {
    ok: true,
    plugin: "codex-project-context",
    projectRoot,
    context,
    handoffCount: index.entries.length,
  };
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
  return {
    schemaVersion: 1,
    projectRoot: ".",
    currentCycle: existing?.currentCycle ?? "development",
    agentsFile: existing?.agentsFile ?? "AGENTS.md",
    handoffIndex: existing?.handoffIndex ?? ".agent/handoff/index.json",
    capabilities: await detectCapabilities(projectRoot),
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
  };
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
  const managed = renderManagedSection(context);
  const next = upsertManagedSection(current, managed);
  await writeTextAtomic(agentsPath, next);
  return agentsPath;
}

function upsertManagedSection(current: string, managed: string): string {
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);

  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
    throw new Error("AGENTS.md contains an incomplete project-context managed section.");
  }

  if (start >= 0 && end >= 0) {
    const after = end + MANAGED_END.length;
    return `${current.slice(0, start)}${managed}${current.slice(after)}`;
  }

  const prefix = current.trimEnd();
  return prefix.length === 0 ? `${managed}\n` : `${prefix}\n\n${managed}\n`;
}

function renderManagedSection(context: ProjectContext): string {
  const enabled = Object.entries(context.capabilities)
    .filter(([, value]) => value)
    .map(([name]) => name)
    .join(", ");

  return `${MANAGED_START}
## Project Context

- Durable context configuration: \`${context.handoffIndex.replace("handoff/index.json", "context.json")}\`.
- Handoff index: \`${context.handoffIndex}\`; read only records relevant to the current task.
- Create handoffs with \`$codex-project-context:project-handoff\`; every diagnosis and verification claim needs evidence.
- Refresh detected resources with \`$codex-project-context:project-sync\` after project tooling or reference locations change.
- Detected optional capabilities: ${enabled || "none"}.
${MANAGED_END}`;
}
