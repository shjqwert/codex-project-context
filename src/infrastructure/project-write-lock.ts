import { link, lstat, mkdir, open, readFile, readdir, rm, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { ensureDirectory } from "./files.js";

const LOCK_NAME = ".project-context-write.lock";
const LOCK_TIMEOUT_MS = 5_000;
const RETRY_MS = 25;

interface LockMetadata {
  token: string;
  pid: number;
  host: string;
  createdAt: string;
}

interface OwnedGeneration {
  directory: string;
  generation: number;
  token: string;
}

interface GenerationState {
  latestPending: number;
  latestRecord: number;
}

export async function withProjectWriteLock<T>(
  projectRoot: string,
  action: () => Promise<T>,
): Promise<T> {
  const agentDirectory = resolve(projectRoot, ".agent");
  const lockDirectory = resolve(agentDirectory, LOCK_NAME);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  await ensureDirectory(agentDirectory);
  await ensureGenerationDirectory(lockDirectory, deadline);
  const owned = await acquireGeneration(lockDirectory, deadline);

  try {
    return await action();
  } finally {
    await releaseGeneration(owned);
  }
}

async function ensureGenerationDirectory(lockPath: string, deadline: number): Promise<void> {
  while (true) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST") && !isWindowsCreationRetry(error)) throw error;
      if (isWindowsCreationRetry(error)) {
        if (Date.now() >= deadline) throw error;
        await delay(RETRY_MS);
        continue;
      }
    }

    try {
      const details = await lstat(lockPath);
      if (details.isDirectory() && !details.isSymbolicLink()) return;
      if (details.isFile() && !details.isSymbolicLink() && await legacyOwnerIsDead(lockPath)) {
        await migrateDeadLegacyLock(lockPath);
        continue;
      }
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) continue;
      if (isWindowsCreationRetry(error) && Date.now() < deadline) {
        await delay(RETRY_MS);
        continue;
      }
      throw error;
    }

    if (Date.now() >= deadline) throw timeoutError(lockPath);
    await delay(RETRY_MS);
  }
}

async function migrateDeadLegacyLock(lockPath: string): Promise<void> {
  try {
    // unlink is deliberately type-constrained: a concurrent migrator may have
    // already replaced the legacy file with the new directory, which must never
    // be renamed or removed by a late recovery attempt.
    await unlink(lockPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    try {
      const details = await lstat(lockPath);
      if (details.isDirectory() && !details.isSymbolicLink()) return;
    } catch (inspectionError) {
      if (hasErrorCode(inspectionError, "ENOENT")) return;
    }
    throw error;
  }

  try {
    await mkdir(lockPath);
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
    const details = await lstat(lockPath);
    if (!details.isDirectory() || details.isSymbolicLink()) throw error;
  }
}

async function acquireGeneration(directory: string, deadline: number): Promise<OwnedGeneration> {
  const metadata: LockMetadata = {
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    createdAt: new Date().toISOString(),
  };

  while (true) {
    const generations = await generationState(directory);
    if (generations.latestPending > 0
      && !(await markerExists(resolve(directory, releasedName(generations.latestPending))))) {
      const owner = await readOwner(resolve(directory, pendingName(generations.latestPending)));
      if (!ownerIsConfirmedDead(owner)) {
        if (Date.now() >= deadline) throw timeoutError(directory);
        await delay(RETRY_MS);
        continue;
      }
    }
    if (!Number.isSafeInteger(generations.latestRecord + 1)) {
      throw new Error("Project-context write lock generation is exhausted.");
    }

    const next = generations.latestRecord + 1;
    const pending = resolve(directory, pendingName(next));
    const temporary = resolve(directory, `owner-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        // Publishing a hard link exposes complete, immutable owner metadata and
        // gives exactly one concurrent contender ownership of this generation.
        await link(temporary, pending);
      } catch (error) {
        if (hasErrorCode(error, "EEXIST")) continue;
        if (isWindowsCreationRetry(error) && Date.now() < deadline) {
          await delay(RETRY_MS);
          continue;
        }
        throw error;
      }
      return { directory, generation: next, token: metadata.token };
    } catch (error) {
      if (isWindowsCreationRetry(error) && Date.now() < deadline) {
        await delay(RETRY_MS);
        continue;
      }
      throw error;
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

async function generationState(directory: string): Promise<GenerationState> {
  let latestPending = 0;
  let latestRecord = 0;
  for (const name of await readdir(directory)) {
    const match = /^generation-([1-9][0-9]*)\.(pending|released)$/u.exec(name);
    if (match === null) continue;
    const parsed = Number(match[1]);
    if (!Number.isSafeInteger(parsed)) throw new Error("Invalid project-context write lock generation.");
    latestRecord = Math.max(latestRecord, parsed);
    if (match[2] === "pending") latestPending = Math.max(latestPending, parsed);
  }
  return { latestPending, latestRecord };
}

async function legacyOwnerIsDead(lockPath: string): Promise<boolean> {
  try {
    return ownerIsConfirmedDead(await readOwner(lockPath));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return true;
    return false;
  }
}

async function readOwner(path: string): Promise<LockMetadata | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<LockMetadata>;
    if (typeof value.token !== "string" || value.token.length === 0
      || typeof value.pid !== "number" || !Number.isSafeInteger(value.pid) || value.pid <= 0
      || typeof value.host !== "string" || value.host.length === 0
      || typeof value.createdAt !== "string" || value.createdAt.length === 0) {
      return undefined;
    }
    return value as LockMetadata;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) throw error;
    return undefined;
  }
}

function ownerIsConfirmedDead(owner: LockMetadata | undefined): boolean {
  if (owner === undefined || owner.host !== hostname()) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    // Permission or platform errors do not prove that an owner exited.
    return hasErrorCode(error, "ESRCH");
  }
}

async function releaseGeneration(owned: OwnedGeneration): Promise<void> {
  const pending = await readOwner(resolve(owned.directory, pendingName(owned.generation)));
  if (pending?.token !== owned.token) {
    throw new Error(`Project-context write lock ownership changed unexpectedly: ${owned.directory}`);
  }
  const released = resolve(owned.directory, releasedName(owned.generation));
  try {
    const handle = await open(released, "wx");
    await handle.close();
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
  }
}

async function markerExists(path: string): Promise<boolean> {
  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(`Invalid project-context write lock release marker: ${path}`);
    }
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

function pendingName(generation: number): string {
  return `generation-${generation}.pending`;
}

function releasedName(generation: number): string {
  return `generation-${generation}.released`;
}

function timeoutError(path: string): Error {
  return new Error(`Timed out waiting for project-context write lock: ${path}`);
}

function isWindowsCreationRetry(error: unknown): boolean {
  return process.platform === "win32" && hasErrorCode(error, "EPERM");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
