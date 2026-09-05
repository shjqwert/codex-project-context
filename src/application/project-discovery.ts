import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import type {
  ProjectCapabilities,
  ProjectInventory,
  ProjectProfile,
  ProjectResource,
  ProjectResourceKind,
} from "../types.js";
import { assertDirectory, pathExists, readJsonIfPresent } from "../infrastructure/files.js";

const MAX_DEPTH = 12;
const MAX_ENTRIES = 50_000;
const MAX_RESOURCES = 24;
const IGNORED_DIRECTORIES = new Set([
  ".agent",
  ".codegraph",
  ".generated",
  ".git",
  ".local-marketplace",
  ".metadata",
  ".pytest_cache",
  ".serena",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "tmp",
  "vendor",
]);

interface ProjectSnapshot {
  files: string[];
  directories: string[];
  fileSignatures: Array<[path: string, size: number, modifiedAt: number]>;
  entriesSeen: number;
  observedMaxDepth: number;
  truncationReasons: Set<"depth-limit" | "entry-limit">;
}

const CAPABILITY_DIRECTORIES = new Set([".codegraph", ".serena"]);

export async function discoverProject(
  projectRoot: string,
): Promise<{ profile: ProjectProfile; resources: ProjectResource[] }> {
  const inventory = await inspectProject(projectRoot);
  return { profile: inventory.profile, resources: inventory.resources };
}

export async function inspectProject(projectRoot: string): Promise<ProjectInventory> {
  await assertDirectory(projectRoot);
  const snapshot = await scanProject(projectRoot);
  const packageJson = await readPackageJson(projectRoot);
  const profile: ProjectProfile = {
    name: packageJson?.name ?? basename(projectRoot),
    projectTypes: detectProjectTypes(snapshot),
    languages: detectLanguages(snapshot.files),
    sourceDirectories: detectDirectories(snapshot.directories, [
      "app",
      "apps",
      "application",
      "appl",
      "boot",
      "bootloader",
      "bsp",
      "bsw",
      "cdd",
      "drivers",
      "firmware",
      "include",
      "lib",
      "libs",
      "mcal",
      "packages",
      "source",
      "sources",
      "src",
    ]),
    testDirectories: detectDirectories(snapshot.directories, [
      "test",
      "tests",
      "testing",
    ]).filter((path) => !isSpecificationPath(path)),
    specificationDirectories: detectSpecificationDirectories(snapshot.directories),
  };
  const resources = detectResources(snapshot);
  const capabilities = await detectCapabilities(projectRoot, snapshot);
  const scan = {
    maxDepth: MAX_DEPTH,
    entryLimit: MAX_ENTRIES,
    entriesSeen: snapshot.entriesSeen,
    observedMaxDepth: snapshot.observedMaxDepth,
    truncated: snapshot.truncationReasons.size > 0,
    truncationReasons: [...snapshot.truncationReasons].sort(),
  };
  const paths = [...new Set([...snapshot.directories, ...snapshot.files])].sort();
  const fingerprintPaths = paths.filter((path) => path.toLocaleLowerCase() !== "agents.md");
  const fileSignatures = snapshot.fileSignatures.filter(
    ([path]) => path.toLocaleLowerCase() !== "agents.md",
  );
  const fingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify({
      capabilities,
      profile,
      resources,
      scan: {
        maxDepth: scan.maxDepth,
        entryLimit: scan.entryLimit,
        truncated: scan.truncated,
        truncationReasons: scan.truncationReasons,
      },
      paths: fingerprintPaths,
      fileSignatures,
    }))
    .digest("hex")}`;
  return {
    schemaVersion: 1,
    projectRoot: ".",
    fingerprint,
    scan,
    capabilities,
    profile,
    resources,
    paths,
  };
}

async function scanProject(projectRoot: string): Promise<ProjectSnapshot> {
  const files: string[] = [];
  const directories: string[] = [];
  const fileSignatures: Array<[string, number, number]> = [];
  let entriesSeen = 0;
  let observedMaxDepth = 0;
  const truncationReasons = new Set<"depth-limit" | "entry-limit">();

  const visit = async (absoluteDirectory: string, depth: number): Promise<void> => {
    if (entriesSeen >= MAX_ENTRIES) {
      truncationReasons.add("entry-limit");
      return;
    }
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entriesSeen >= MAX_ENTRIES) {
        truncationReasons.add("entry-limit");
        break;
      }
      entriesSeen += 1;
      const absolute = resolve(absoluteDirectory, entry.name);
      const projectPath = normalizePath(relative(projectRoot, absolute));
      observedMaxDepth = Math.max(observedMaxDepth, projectPath.split("/").length - 1);
      if (entry.isDirectory()) {
        const lowerName = entry.name.toLocaleLowerCase();
        if (IGNORED_DIRECTORIES.has(lowerName)) {
          if (depth === 0 && CAPABILITY_DIRECTORIES.has(lowerName)) directories.push(projectPath);
          continue;
        }
        if (isGeneratedArchitectureOutput(projectPath, true)) continue;
        directories.push(projectPath);
        if (depth < MAX_DEPTH) {
          await visit(absolute, depth + 1);
        } else {
          truncationReasons.add("depth-limit");
        }
      } else if (entry.isFile()) {
        if (isGeneratedArchitectureOutput(projectPath, false)) continue;
        files.push(projectPath);
        try {
          const details = await stat(absolute);
          fileSignatures.push([projectPath, details.size, details.mtimeMs]);
        } catch {
          fileSignatures.push([projectPath, -1, -1]);
        }
      }
    }
  };

  await visit(projectRoot, 0);
  return {
    files,
    directories,
    fileSignatures,
    entriesSeen,
    observedMaxDepth,
    truncationReasons,
  };
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
  if ([...files].some((path) => /\.(ewp|eww)$/u.test(path))) types.add("IAR");
  if ([...files].some((path) => /\.(uvprojx?|uvmpw)$/u.test(path))) types.add("Keil");
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
    .sort((left, right) => {
      const baselinePriority = Number(isArchitectureBaselinePath(right.path))
        - Number(isArchitectureBaselinePath(left.path));
      return baselinePriority
        || left.kind.localeCompare(right.kind)
        || left.path.localeCompare(right.path);
    })
    .slice(0, MAX_RESOURCES);
}

async function detectCapabilities(
  projectRoot: string,
  snapshot: ProjectSnapshot,
): Promise<ProjectCapabilities> {
  const roots = new Set(
    snapshot.directories
      .filter((path) => !path.includes("/"))
      .map((path) => path.toLocaleLowerCase()),
  );
  return {
    codegraph: roots.has(".codegraph"),
    serena: roots.has(".serena") && await pathExists(resolve(projectRoot, ".serena", "project.yml")),
    openspec: roots.has("openspec") || roots.has(".openspec"),
  };
}

function classifyResource(path: string, directory: boolean): ProjectResourceKind | undefined {
  const lower = path.toLocaleLowerCase();
  const name = basename(lower);
  const extension = extname(lower);
  if (/(^|\/)(openspec|\.openspec|specifications?|specs?)(\/|$)/u.test(lower) || extension === ".arxml") {
    return "specification";
  }
  if (/(^|\/)(tests?|testing)(\/|$)/u.test(lower)) return "test";
  if (/(schematic|hardware|pcb|原理图|电路图)/u.test(lower)
    || /(^|[\/_. -])(circuit|sch)([\/_. -]|$)/u.test(lower)
    || [".dsn", ".kicad_sch", ".sch"].includes(extension)) {
    return "hardware";
  }
  if (/(manual|datasheet)/u.test(lower)) return "manual";
  if (extension === ".pdf") return "documentation";
  if (
    /(^|\/)(architecture|docs?|documentation|references?)(\/|$)/u.test(lower) ||
    [".c4", ".likec4"].includes(extension) ||
    (!directory && ["readme.md", "architecture.md", "contributing.md"].includes(name))
  ) {
    return "documentation";
  }
  return undefined;
}

function buildResource(kind: ProjectResourceKind, path: string): ProjectResource {
  if (kind === "documentation" && isArchitectureBaselinePath(path)) {
    return {
      kind,
      path,
      purpose: "Architecture baseline; read before changing module responsibilities, dependencies, state ownership, public interfaces, scheduling, hardware boundaries, or architecture intent.",
    };
  }
  const purposes: Record<ProjectResourceKind, string> = {
    documentation: "Project documentation; read only when the task depends on it.",
    manual: "Manual or datasheet; inspect metadata first and open relevant content only when needed.",
    hardware: "Hardware or schematic reference; use for hardware-facing behavior and constraints.",
    specification: "Specification source; use to confirm intended behavior and accepted changes.",
    test: "Test reference or suite; use to identify verification entry points and current behavior.",
  };
  return { kind, path, purpose: purposes[kind] };
}

function isArchitectureBaselinePath(path: string): boolean {
  return /^architecture\/(?:[^/]+\/)?baseline\.md$/u.test(
    normalizePath(path).toLocaleLowerCase(),
  );
}

function isGeneratedArchitectureOutput(path: string, directory: boolean): boolean {
  const lower = normalizePath(path).toLocaleLowerCase();
  if (!/(^|\/)architecture(\/|$)/u.test(lower)) return false;
  const segments = lower.split("/");
  const architectureIndex = segments.indexOf("architecture");
  const architecturePath = segments.slice(architectureIndex + 1);
  if (
    architecturePath.length >= 2
    && architecturePath.slice(1).some((segment) => ["layouts", "png", "site"].includes(segment))
  ) return true;
  if (directory) return false;
  const name = basename(lower);
  const extension = extname(lower);
  return [".htm", ".html", ".png", ".svg"].includes(extension)
    || (extension === ".json" && /(^|[._-])layouts?([._-]|$)/u.test(name));
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
