import { readdir } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import type { ProjectProfile, ProjectResource, ProjectResourceKind } from "../types.js";
import { readJsonIfPresent } from "../infrastructure/files.js";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 5_000;
const IGNORED_DIRECTORIES = new Set([
  ".agent",
  ".git",
  ".local-marketplace",
  ".pytest_cache",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

interface ProjectSnapshot {
  files: string[];
  directories: string[];
}

export async function discoverProject(
  projectRoot: string,
): Promise<{ profile: ProjectProfile; resources: ProjectResource[] }> {
  const snapshot = await scanProject(projectRoot);
  const packageJson = await readPackageJson(projectRoot);
  const profile: ProjectProfile = {
    name: packageJson?.name ?? basename(projectRoot),
    projectTypes: detectProjectTypes(snapshot),
    languages: detectLanguages(snapshot.files),
    sourceDirectories: detectDirectories(snapshot.directories, [
      "app",
      "apps",
      "include",
      "lib",
      "libs",
      "packages",
      "source",
      "src",
    ]),
    testDirectories: detectDirectories(snapshot.directories, [
      "test",
      "tests",
      "testing",
    ]).filter((path) => !isSpecificationPath(path)),
    specificationDirectories: detectSpecificationDirectories(snapshot.directories),
  };
  return { profile, resources: detectResources(snapshot) };
}

async function scanProject(projectRoot: string): Promise<ProjectSnapshot> {
  const files: string[] = [];
  const directories: string[] = [];
  let entriesSeen = 0;

  const visit = async (absoluteDirectory: string, depth: number): Promise<void> => {
    if (entriesSeen >= MAX_ENTRIES) return;
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entriesSeen >= MAX_ENTRIES) break;
      entriesSeen += 1;
      const absolute = resolve(absoluteDirectory, entry.name);
      const projectPath = normalizePath(relative(projectRoot, absolute));
      if (entry.isDirectory()) {
        directories.push(projectPath);
        if (depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase())) {
          await visit(absolute, depth + 1);
        }
      } else if (entry.isFile()) {
        files.push(projectPath);
      }
    }
  };

  await visit(projectRoot, 0);
  return { files, directories };
}

async function readPackageJson(
  projectRoot: string,
): Promise<{ name?: string } | undefined> {
  let value: unknown;
  try {
    value = await readJsonIfPresent<unknown>(resolve(projectRoot, "package.json"));
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  return {
    ...(typeof value.name === "string" && value.name.trim().length > 0 ? { name: value.name.trim() } : {}),
  };
}

function detectProjectTypes(snapshot: ProjectSnapshot): string[] {
  const files = new Set(snapshot.files.map((path) => path.toLocaleLowerCase()));
  const types = new Set<string>();
  if (files.has("package.json")) types.add("Node.js");
  if ([...files].some((path) => basename(path).startsWith("tsconfig") && path.endsWith(".json"))) {
    types.add("TypeScript");
  }
  if (files.has("pyproject.toml") || files.has("requirements.txt")) types.add("Python");
  if (files.has("cargo.toml")) types.add("Rust");
  if (files.has("cmakelists.txt") || files.has("makefile")) types.add("Native build");
  if ([...files].some((path) => path.endsWith(".sln") || path.endsWith(".vcxproj"))) {
    types.add("Visual Studio");
  }
  if ([...files].some((path) => path.endsWith(".c") || path.endsWith(".h") || path.endsWith(".cpp"))) {
    types.add("C/C++");
  }
  if ([...files].some((path) => path.endsWith(".arxml"))) types.add("AUTOSAR");
  if (files.has("platformio.ini")) types.add("PlatformIO");
  return [...types].sort();
}

function detectLanguages(files: string[]): string[] {
  const names = new Map<string, string>([
    [".c", "C"],
    [".cc", "C++"],
    [".cpp", "C++"],
    [".cs", "C#"],
    [".h", "C/C++ headers"],
    [".hpp", "C++ headers"],
    [".java", "Java"],
    [".js", "JavaScript"],
    [".jsx", "JavaScript/JSX"],
    [".kt", "Kotlin"],
    [".m", "Objective-C"],
    [".py", "Python"],
    [".rs", "Rust"],
    [".swift", "Swift"],
    [".ts", "TypeScript"],
    [".tsx", "TypeScript/TSX"],
  ]);
  const counts = new Map<string, number>();
  for (const file of files) {
    const language = names.get(extname(file).toLocaleLowerCase());
    if (language !== undefined) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([language]) => language);
}

function detectDirectories(directories: string[], names: string[]): string[] {
  const accepted = new Set(names);
  return directories
    .filter((path) => accepted.has(basename(path).toLocaleLowerCase()))
    .sort()
    .slice(0, 12);
}

function detectSpecificationDirectories(directories: string[]): string[] {
  return directories
    .filter((path) => isSpecificationPath(path))
    .sort()
    .slice(0, 12);
}

function isSpecificationPath(path: string): boolean {
  const lower = normalizePath(path).toLocaleLowerCase();
  const segments = lower.split("/");
  return (
    segments.includes("openspec") ||
    segments.includes(".openspec") ||
    ["spec", "specs", "specification", "specifications"].includes(segments.at(-1) ?? "")
  );
}

function detectResources(snapshot: ProjectSnapshot): ProjectResource[] {
  const resources = new Map<string, ProjectResource>();
  for (const path of snapshot.directories) {
    const kind = classifyResource(path, true);
    if (kind !== undefined) resources.set(path, buildResource(kind, path));
  }
  for (const path of snapshot.files) {
    const kind = classifyResource(path, false);
    if (kind !== undefined) resources.set(path, buildResource(kind, path));
  }
  return [...resources.values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path))
    .slice(0, 24);
}

function classifyResource(path: string, directory: boolean): ProjectResourceKind | undefined {
  const lower = path.toLocaleLowerCase();
  const name = basename(lower);
  const extension = extname(lower);
  if (/(^|\/)(openspec|\.openspec|specifications?|specs?)(\/|$)/u.test(lower) || extension === ".arxml") {
    return "specification";
  }
  if (/(^|\/)(tests?|testing)(\/|$)/u.test(lower)) return "test";
  if (/(schematic|hardware|pcb)/u.test(lower) || [".dsn", ".kicad_sch", ".sch"].includes(extension)) {
    return "hardware";
  }
  if (/(manual|datasheet)/u.test(lower) || extension === ".pdf") return "manual";
  if (
    /(^|\/)(docs?|documentation|references?)(\/|$)/u.test(lower) ||
    (!directory && ["readme.md", "architecture.md", "contributing.md"].includes(name))
  ) {
    return "documentation";
  }
  return undefined;
}

function buildResource(kind: ProjectResourceKind, path: string): ProjectResource {
  const purposes: Record<ProjectResourceKind, string> = {
    documentation: "Project documentation; read only when the task depends on it.",
    manual: "Manual or datasheet; inspect metadata first and open relevant content only when needed.",
    hardware: "Hardware or schematic reference; use for hardware-facing behavior and constraints.",
    specification: "Specification source; use to confirm intended behavior and accepted changes.",
    test: "Test reference or suite; use to identify verification entry points and current behavior.",
  };
  return { kind, path, purpose: purposes[kind] };
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
