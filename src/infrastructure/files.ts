import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function assertDirectory(path: string): Promise<void> {
  const details = await stat(path);
  if (!details.isDirectory()) {
    throw new Error(`Not a directory: ${path}`);
  }
}

export async function readTextIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

export async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  const text = await readTextIfPresent(path);
  return text === undefined ? undefined : (JSON.parse(text) as T);
}

export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await ensureDirectory(dirname(path));
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function findProjectRoot(startDirectory: string): Promise<string | undefined> {
  let current = resolve(startDirectory);

  while (true) {
    if (await pathExists(resolve(current, ".agent", "context.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current || current === parse(current).root) {
      return undefined;
    }
    current = parent;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

