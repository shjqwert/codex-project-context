import { createHash } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

export async function claimPromptInjection(
  sessionId: string | undefined,
  projectRoot: string,
  matchIdentity: string,
): Promise<boolean> {
  const stateDirectory = sessionProjectStateDirectory(sessionId, projectRoot);
  if (stateDirectory === undefined) return true;

  await mkdir(stateDirectory, { recursive: true });
  const markerPath = resolve(stateDirectory, `${hash(matchIdentity)}.seen`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(markerPath, "wx");
    await handle.writeFile(`${new Date().toISOString()}\n`, "utf8");
    return true;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    handle = undefined;
    if (hasErrorCode(error, "EEXIST")) return false;
    await rm(markerPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function resetPromptInjectionState(
  sessionId: string | undefined,
  projectRoot: string,
): Promise<void> {
  const stateDirectory = sessionProjectStateDirectory(sessionId, projectRoot);
  if (stateDirectory !== undefined) {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

function sessionProjectStateDirectory(
  sessionId: string | undefined,
  projectRoot: string,
): string | undefined {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) return undefined;
  return resolve(stateRoot(), hash(`${normalizedSessionId}\0${resolve(projectRoot)}`));
}

function stateRoot(): string {
  const configuredPath = process.env.CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR?.trim();
  if (configuredPath) return resolve(configuredPath);
  const codexRoot = process.env.CODEX_HOME?.trim() || resolve(homedir(), ".codex");
  return resolve(codexRoot, "state", "project-context-hooks", "prompt-injections");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
