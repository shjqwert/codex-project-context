import { createHash, randomUUID } from "node:crypto";
import { access, link, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

/** Serialize output within a session/project without claiming any unshown card. */
export async function withPromptInjectionReservation(
  sessionId: string | undefined,
  projectRoot: string,
  emit: () => Promise<void>,
): Promise<void> {
  const directory = sessionProjectStateDirectory(sessionId, projectRoot);
  if (directory === undefined) return emit();
  await mkdir(directory, { recursive: true });

  let generation = 0;
  for (const name of await readdir(directory)) {
    const number = /^reservation-([1-9][0-9]*)\.pending$/u.exec(name)?.[1];
    if (number === undefined) continue;
    const parsed = Number(number);
    if (!Number.isSafeInteger(parsed)) throw new Error("Invalid Hook reservation generation.");
    generation = Math.max(generation, parsed);
  }
  if (generation > 0 && !(await markerExists(resolve(directory, `reservation-${generation}.released`)))) {
    const owner = JSON.parse(await readFile(resolve(directory, `reservation-${generation}.pending`), "utf8")) as { pid?: unknown };
    if (typeof owner?.pid !== "number" || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
      throw new Error("Invalid Hook reservation owner; reset the session state before retrying.");
    }
    if (processIsRunning(owner.pid)) return;
  }
  if (!Number.isSafeInteger(generation + 1)) throw new Error("Hook reservation generation is exhausted.");

  const pending = resolve(directory, `reservation-${generation + 1}.pending`);
  const released = resolve(directory, `reservation-${generation + 1}.released`);
  const temporary = resolve(directory, `owner-${randomUUID()}.tmp`);
  let owned = false;
  try {
    // A hard link publishes complete metadata atomically and fails if another Hook won.
    await writeFile(temporary, JSON.stringify({ pid: process.pid }), { encoding: "utf8", flag: "wx" });
    try {
      await link(temporary, pending);
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) return;
      throw error;
    }
    owned = true;
    await emit();
  } finally {
    try {
      // Keep published generations immutable until session reset. Removing an old
      // pending file would let competing recoverers reuse different generations.
      if (owned) await writeFile(released, "", { flag: "wx" });
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

async function markerExists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

function processIsRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    // Permission errors do not establish that the owner exited. Never evict it.
    return !hasErrorCode(error, "ESRCH");
  }
}

export async function hasPromptInjection(
  sessionId: string | undefined,
  projectRoot: string,
  matchIdentity: string,
): Promise<boolean> {
  const directory = sessionProjectStateDirectory(sessionId, projectRoot);
  if (directory === undefined) return false;
  try {
    await access(resolve(directory, `${hash(matchIdentity)}.seen`));
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

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
