import { rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(repositoryRoot, "dist");
const expectedPrefix = `${repositoryRoot}${sep}`;

if (!distRoot.startsWith(expectedPrefix) || distRoot === repositoryRoot) {
  throw new Error("Refusing to clean outside the repository.");
}

await rm(distRoot, { recursive: true, force: true });
