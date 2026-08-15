import { resolve } from "node:path";
import type { NotebookLmProjectIndex } from "../types.js";
import {
  readTextIfPresent,
  removeFileIfPresent,
  writeTextAtomic,
} from "../infrastructure/files.js";
import { withProjectWriteLock } from "../infrastructure/project-write-lock.js";
import {
  NOTEBOOKLM_INDEX_PATH,
  ensureNotebookLmIndexExcluded,
  readNotebookLmIndexStatus,
  requireValidNotebookLmIndexStatus,
  restoreNotebookLmIndexExclusion,
  validateNotebookLmProjectIndex,
  writeNotebookLmProjectIndex,
} from "./notebooklm-index.js";
import { readProjectContext, requireProjectRoot } from "./project-context.js";

export interface NotebookLmProjectConfigurationResult {
  ok: true;
  action: "configured";
  projectRoot: string;
  indexPath: string;
  agentsPath: string;
  state: "enabled" | "disabled";
  mode: NotebookLmProjectIndex["mode"];
  notebookCount: number;
  componentCount: number;
  noteCount: number;
}

export async function getProjectNotebookLmIndexStatus(
  projectDirectory: string,
): Promise<Record<string, unknown>> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const status = await readNotebookLmIndexStatus(projectRoot);
  return { ok: status.state !== "invalid", projectRoot, ...summarizeNotebookLmStatus(status) };
}

export async function configureProjectNotebookLmIndex(
  projectDirectory: string,
  rawIndex: unknown,
): Promise<NotebookLmProjectConfigurationResult> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const context = await readProjectContext(projectRoot);
    const currentStatus = await requireValidNotebookLmIndexStatus(projectRoot);
    const index = await validateNotebookLmProjectIndex(projectRoot, rawIndex, { verifySchematicHash: true });
    const indexPath = resolve(projectRoot, NOTEBOOKLM_INDEX_PATH);
    const previousIndex = currentStatus.state === "unconfigured"
      ? undefined
      : await readTextIfPresent(indexPath);

    const exclusion = await ensureNotebookLmIndexExcluded(projectRoot);
    try {
      await writeNotebookLmProjectIndex(projectRoot, index);
    } catch (error) {
      if (previousIndex === undefined) await removeFileIfPresent(indexPath);
      else await writeTextAtomic(indexPath, previousIndex);
      await restoreNotebookLmIndexExclusion(exclusion);
      throw error;
    }

    return {
      ok: true,
      action: "configured",
      projectRoot,
      indexPath,
      agentsPath: resolve(projectRoot, context.agentsFile),
      state: index.mode === "disabled" ? "disabled" : "enabled",
      mode: index.mode,
      notebookCount: index.notebooks.length,
      componentCount: index.components.length,
      noteCount: index.notes.length,
    };
  });
}

function summarizeNotebookLmStatus(
  status: Awaited<ReturnType<typeof readNotebookLmIndexStatus>>,
): Record<string, unknown> {
  return {
    state: status.state,
    path: status.path,
    mode: status.mode,
    notebookCount: status.notebookCount,
    componentCount: status.componentCount,
    noteCount: status.noteCount,
    notebooks: status.index?.notebooks.map(({ scope, id, title }) => ({ scope, id, title })) ?? [],
    schematic: status.index?.schematic === undefined
      ? null
      : {
          path: status.index.schematic.path,
          sha256: status.index.schematic.sha256,
          currentSha256: status.currentSchematicSha256,
          changed: status.schematicChanged === true,
        },
    lastRefreshedAt: status.index?.lastRefreshedAt ?? null,
    advisories: status.index?.advisories ?? [],
    ...(status.error === undefined ? {} : { error: status.error }),
  };
}
