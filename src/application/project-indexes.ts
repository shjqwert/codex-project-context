import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { assertDirectory, pathExists } from "../infrastructure/files.js";
import type { ProjectProfile } from "../types.js";
import { inspectProject } from "./project-discovery.js";

const COMMAND_TIMEOUT_MS = 15 * 60 * 1_000;
const OUTPUT_LIMIT = 4_000;

export type ProjectIndexStatus = "created" | "existing" | "failed" | "unavailable";

export interface ProjectIndexToolResult {
  status: ProjectIndexStatus;
  command?: string;
  message?: string;
}

export interface ProjectIndexPreparationResult {
  ok: true;
  action: "prepared";
  projectRoot: string;
  codegraph: ProjectIndexToolResult;
  serena: ProjectIndexToolResult;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
  timedOut?: boolean;
}

export type CommandRunner = (
  command: string,
  arguments_: string[],
  workingDirectory: string,
) => Promise<CommandResult>;

export async function prepareProjectIndexes(
  projectDirectory: string,
  runCommand: CommandRunner = runExternalCommand,
): Promise<ProjectIndexPreparationResult> {
  const projectRoot = resolve(projectDirectory);
  await assertDirectory(projectRoot);
  const inventory = await inspectProject(projectRoot);

  const codegraph = await prepareIndex(
    "codegraph",
    ["init", projectRoot],
    projectRoot,
    resolve(projectRoot, ".codegraph"),
    runCommand,
  );
  const serena = await prepareIndex(
    "serena",
    serenaArguments(projectRoot, inventory.profile),
    projectRoot,
    resolve(projectRoot, ".serena", "project.yml"),
    runCommand,
  );

  return {
    ok: true,
    action: "prepared",
    projectRoot,
    codegraph,
    serena,
  };
}

async function prepareIndex(
  command: string,
  arguments_: string[],
  projectRoot: string,
  markerPath: string,
  runCommand: CommandRunner,
): Promise<ProjectIndexToolResult> {
  if (await pathExists(markerPath)) return { status: "existing" };

  const renderedCommand = renderCommand(command, arguments_);
  const result = await runCommand(command, arguments_, projectRoot);
  if (result.errorCode === "ENOENT") {
    return {
      status: "unavailable",
      command: renderedCommand,
      message: `${command} is not available on PATH.`,
    };
  }
  if (result.timedOut) {
    return {
      status: "failed",
      command: renderedCommand,
      message: `${command} timed out while creating the project index.`,
    };
  }
  if (result.exitCode !== 0) {
    return {
      status: "failed",
      command: renderedCommand,
      message: boundedMessage(result.stderr || result.stdout || `${command} exited with code ${result.exitCode}.`),
    };
  }
  if (!(await pathExists(markerPath))) {
    return {
      status: "failed",
      command: renderedCommand,
      message: `${command} completed without creating ${markerPath}.`,
    };
  }
  return { status: "created", command: renderedCommand };
}

function serenaArguments(projectRoot: string, profile: ProjectProfile): string[] {
  const languages = serenaLanguages(profile);
  return [
    "project",
    "create",
    "--index",
    ...languages.flatMap((language) => ["--language", language]),
    projectRoot,
  ];
}

function serenaLanguages(profile: ProjectProfile): string[] {
  const detected = new Set(profile.languages);
  const languages = new Set<string>();
  if (["C", "C++", "C/C++ headers", "C++ headers", "Objective-C"].some((name) => detected.has(name))) {
    languages.add("cpp");
  }
  if (["JavaScript", "JavaScript/JSX", "TypeScript", "TypeScript/TSX"].some((name) => detected.has(name))) {
    languages.add("typescript");
  }
  const direct = new Map<string, string>([
    ["C#", "csharp"],
    ["Java", "java"],
    ["Kotlin", "kotlin"],
    ["Python", "python"],
    ["Rust", "rust"],
    ["Swift", "swift"],
  ]);
  for (const [projectLanguage, serenaLanguage] of direct) {
    if (detected.has(projectLanguage)) languages.add(serenaLanguage);
  }
  return [...languages];
}

async function runExternalCommand(
  command: string,
  arguments_: string[],
  workingDirectory: string,
): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, arguments_, {
      cwd: workingDirectory,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolveResult({
        exitCode: null,
        stdout: boundedMessage(stdout),
        stderr: boundedMessage(stderr),
        timedOut: true,
      });
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout = boundedMessage(`${stdout}${chunk.toString()}`);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = boundedMessage(`${stderr}${chunk.toString()}`);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode: null,
        stdout,
        stderr: boundedMessage(error.message),
        ...(error.code === undefined ? {} : { errorCode: error.code }),
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult({
        exitCode,
        stdout: boundedMessage(stdout),
        stderr: boundedMessage(stderr),
      });
    });
  });
}

function renderCommand(command: string, arguments_: string[]): string {
  return [command, ...arguments_.map((argument) => JSON.stringify(argument))].join(" ");
}

function boundedMessage(message: string): string {
  const normalized = message.trim();
  return normalized.length <= OUTPUT_LIMIT ? normalized : normalized.slice(-OUTPUT_LIMIT);
}
