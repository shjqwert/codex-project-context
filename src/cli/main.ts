#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin } from "node:process";
import {
  createHandoff,
  getHandoffHistory,
  matchHandoffs,
  rebuildHandoffIndex,
  verifyHandoffIndex,
} from "../application/handoffs.js";
import {
  createProjectPlan,
  listProjectPlans,
  transitionProjectPlan,
} from "../application/plan-msg.js";
import { inspectProject } from "../application/project-discovery.js";
import { prepareProjectIndexes } from "../application/project-indexes.js";
import {
  configureSolAdvisorImplicitDelegation,
  getProjectStatus,
  initializeProject,
  synchronizeProject,
} from "../application/project-context.js";
import {
  configureProjectNotebookLmIndex,
  getProjectNotebookLmIndexStatus,
} from "../application/notebooklm-project.js";
import {
  inspectNotebookLmLibrary,
  updateNotebookLmLibraryManifest,
} from "../application/notebooklm-library.js";
import type { HandoffWriteInput, ProjectAnalysisDraft, ProjectPlanInput } from "../types.js";

const VERSION = "1.2.1";
const VALUELESS_OPTIONS = new Set(["no-sol-advisor-implicit-delegation"]);

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const [command = "help", ...tokens] = process.argv.slice(2);
  const options = parseOptions(tokens);
  assertAllowedOptions(command, options);
  const project = resolve(option(options, "project") ?? process.cwd());

  switch (command) {
    case "inspect":
      writeJson({ ok: true, projectRoot: project, inventory: await inspectProject(project) });
      break;
    case "prepare-indexes":
      writeJson(await prepareProjectIndexes(project));
      break;
    case "init": {
      const input = await readJsonInput<ProjectAnalysisDraft>(requiredOption(options, "input"));
      writeJson(await initializeProject(
        project,
        input,
        hasFlag(options, "no-sol-advisor-implicit-delegation")
          ? { solAdvisorImplicitDelegation: false }
          : {},
      ));
      break;
    }
    case "sync": {
      const input = await readJsonInput<ProjectAnalysisDraft>(requiredOption(options, "input"));
      writeJson(await synchronizeProject(project, input));
      break;
    }
    case "status":
      writeJson(await getProjectStatus(project));
      break;
    case "notebooklm-index": {
      const action = requiredOption(options, "action");
      if (action === "status") {
        writeJson(await getProjectNotebookLmIndexStatus(project));
      } else if (action === "configure") {
        const input = await readJsonInput<unknown>(requiredOption(options, "input"));
        writeJson(await configureProjectNotebookLmIndex(project, input));
      } else {
        throw new Error("--action must be status or configure.");
      }
      break;
    }
    case "notebooklm-library": {
      const root = resolve(requiredOption(options, "root"));
      const action = requiredOption(options, "action");
      if (action === "inspect") {
        writeJson(await inspectNotebookLmLibrary(root));
      } else if (action === "update") {
        const input = await readJsonInput<unknown>(requiredOption(options, "input"));
        writeJson(await updateNotebookLmLibraryManifest(root, input));
      } else {
        throw new Error("--action must be inspect or update.");
      }
      break;
    }
    case "authorization": {
      const action = requiredOption(options, "sol-advisor-implicit-delegation");
      if (
        action !== "enable"
        && action !== "disable"
        && action !== "inherit"
        && action !== "remove"
      ) {
        throw new Error("--sol-advisor-implicit-delegation must be enable, disable, inherit, or remove.");
      }
      writeJson(await configureSolAdvisorImplicitDelegation(project, action));
      break;
    }
    case "match": {
      const prompt = requiredOption(options, "prompt");
      const rawLimit = option(options, "limit");
      const limit = rawLimit === undefined ? undefined : parseIntegerOption(rawLimit, "limit", 0);
      const matches = await matchHandoffs(project, prompt, limit);
      writeJson({ ok: true, projectRoot: project, matches });
      break;
    }
    case "handoff": {
      const inputPath = requiredOption(options, "input");
      const input = await readJsonInput<HandoffWriteInput>(inputPath);
      writeJson(await createHandoff(project, input));
      break;
    }
    case "handoff-history": {
      const workId = requiredOption(options, "work-id");
      const rawRevision = option(options, "revision");
      const revision = rawRevision === undefined ? undefined : parseIntegerOption(rawRevision, "revision", 1);
      writeJson(await getHandoffHistory(project, workId, revision));
      break;
    }
    case "handoff-index": {
      const action = requiredOption(options, "action");
      if (action === "verify") {
        writeJson(await verifyHandoffIndex(project));
      } else if (action === "rebuild") {
        const index = await rebuildHandoffIndex(project);
        writeJson({ ok: true, action: "rebuilt", projectRoot: project, workCount: index.entries.length });
      } else {
        throw new Error("--action must be verify or rebuild.");
      }
      break;
    }
    case "plan": {
      const action = requiredOption(options, "action");
      if (action === "create") {
        const input = await readJsonInput<ProjectPlanInput>(requiredOption(options, "input"));
        writeJson(await createProjectPlan(project, input));
      } else if (action === "transition") {
        writeJson(
          await transitionProjectPlan(
            project,
            requiredOption(options, "id"),
            requiredOption(options, "status"),
            requiredOption(options, "reason"),
          ),
        );
      } else if (action === "list") {
        writeJson(await listProjectPlans(project));
      } else {
        throw new Error("--action must be create, transition, or list.");
      }
      break;
    }
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      break;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(helpText());
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function parseOptions(tokens: string[]): Map<string, string[]> {
  const options = new Map<string, string[]>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    }
    const name = token.slice(2);
    if (VALUELESS_OPTIONS.has(name)) {
      options.set(name, [...(options.get(name) ?? []), "true"]);
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    options.set(name, [...(options.get(name) ?? []), value]);
    index += 1;
  }
  return options;
}

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}

function requiredOption(options: Map<string, string[]>, name: string): string {
  const value = option(options, name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required option --${name}.`);
  }
  return value;
}

function hasFlag(options: Map<string, string[]>, name: string): boolean {
  return options.has(name);
}

function parseIntegerOption(value: string, name: string, minimum: number): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`--${name} must be ${minimum === 0 ? "a non-negative" : "a positive"} integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`--${name} must be ${minimum === 0 ? "a non-negative" : "a positive"} integer.`);
  }
  return parsed;
}

function assertAllowedOptions(command: string, options: Map<string, string[]>): void {
  const allowedByCommand: Record<string, readonly string[]> = {
    inspect: ["project"],
    "prepare-indexes": ["project"],
    init: ["project", "input", "no-sol-advisor-implicit-delegation"],
    sync: ["project", "input"],
    status: ["project"],
    "notebooklm-index": ["project", "action", "input"],
    "notebooklm-library": ["root", "action", "input"],
    authorization: ["project", "sol-advisor-implicit-delegation"],
    match: ["project", "prompt", "limit"],
    handoff: ["project", "input"],
    "handoff-history": ["project", "work-id", "revision"],
    "handoff-index": ["project", "action"],
    plan: ["project", "action", "input", "id", "status", "reason"],
    version: [],
    "--version": [],
    "-v": [],
    help: [],
    "--help": [],
    "-h": [],
  };
  const allowed = allowedByCommand[command];
  if (allowed === undefined) return;
  const allowedSet = new Set(allowed);
  const unknown = [...options.keys()].find((name) => !allowedSet.has(name));
  if (unknown !== undefined) throw new Error(`Unsupported option for ${command}: --${unknown}.`);
}

async function readJsonInput<T>(inputPath: string): Promise<T> {
  const text = inputPath === "-" ? await readStandardInput() : await readFile(resolve(inputPath), "utf8");
  return JSON.parse(text) as T;
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function helpText(): string {
  return `codex-project-context ${VERSION}

Usage:
  codex-project-context inspect [--project PATH]
  codex-project-context prepare-indexes [--project PATH]
  codex-project-context init [--project PATH] --input FILE|- [--no-sol-advisor-implicit-delegation]
  codex-project-context sync [--project PATH] --input FILE|-
  codex-project-context status [--project PATH]
  codex-project-context notebooklm-index [--project PATH] --action status
  codex-project-context notebooklm-index [--project PATH] --action configure --input FILE|-
  codex-project-context notebooklm-library --root PATH --action inspect
  codex-project-context notebooklm-library --root PATH --action update --input FILE|-
  codex-project-context authorization [--project PATH] --sol-advisor-implicit-delegation enable|disable|inherit|remove
  codex-project-context match [--project PATH] --prompt TEXT [--limit NUMBER]
  codex-project-context handoff [--project PATH] --input FILE|-
  codex-project-context handoff-history [--project PATH] --work-id W001 [--revision NUMBER]
  codex-project-context handoff-index [--project PATH] --action verify|rebuild
  codex-project-context plan [--project PATH] --action create --input FILE|-
  codex-project-context plan [--project PATH] --action transition --id P001 --status STATUS --reason TEXT
  codex-project-context plan [--project PATH] --action list
`;
}
