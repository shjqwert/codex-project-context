import { open, readFile, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureDirectory } from "./files.js";

const LOCK_NAME = ".project-context-write.lock";
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const RETRY_MS = 25;

interface LockMetadata {
  token: string;
  pid: number;
  host: string;
  createdAt: string;
}

export async function withProjectWriteLock<T>(
  projectRoot: string,
  action: () => Promise<T>,
): Promise<T> {
  const agentDirectory = resolve(projectRoot, ".agent");
  const lockPath = resolve(agentDirectory, LOCK_NAME);
  const metadata: LockMetadata = {
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    createdAt: new Date().toISOString(),
  };
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  await ensureDirectory(agentDirectory);

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      let initialized = false;
      try {
        await handle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
        initialized = true;
      } finally {
        await handle.close();
        if (!initialized) await rm(lockPath, { force: true }).catch(() => undefined);
      }
      break;
    } catch (error) {
      // Windows can transiently reject exclusive creation while a previous handle
      // is being released. Retry acquisition only; never remove a lock on EPERM.
      const retryCreation = process.platform === "win32" && hasErrorCode(error, "EPERM");
      if (!hasErrorCode(error, "EEXIST") && !retryCreation) throw error;
      if (!retryCreation && await isStaleLock(lockPath)) {
        await rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        if (retryCreation) throw error;
        throw new Error(`Timed out waiting for project-context write lock: ${lockPath}`);
      }
      await delay(RETRY_MS);
    }
  }

  try {
    return await action();
  } finally {
    await releaseOwnedLock(lockPath, metadata.token);
  }
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const [details, text] = await Promise.all([stat(lockPath), readFile(lockPath, "utf8")]);
    if (Date.now() - details.mtimeMs >= STALE_LOCK_MS) return true;

    const metadata = JSON.parse(text) as Partial<LockMetadata>;
    if (metadata.host !== hostname() || typeof metadata.pid !== "number") return false;
    try {
      process.kill(metadata.pid, 0);
      return false;
    } catch (error) {
      return hasErrorCode(error, "ESRCH");
    }
  } catch (error) {
    return hasErrorCode(error, "ENOENT");
  }
}

async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  try {
    const metadata = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockMetadata>;
    if (metadata.token === token) await rm(lockPath, { force: true });
  } catch {
    // A missing or malformed lock cannot safely be removed here.
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
