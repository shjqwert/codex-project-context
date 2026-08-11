#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin } from "node:process";
import {
  createHandoff,
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
import {
  configureSolAdvisorImplicitDelegation,
  getProjectStatus,
  initializeProject,
  synchronizeProject,
} from "../application/project-context.js";
import type { HandoffInput, ProjectAnalysisDraft, ProjectPlanInput } from "../types.js";

const VERSION = "0.4.1";

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const [command = "help", ...tokens] = process.argv.slice(2);
  const options = parseOptions(tokens);
  const project = resolve(option(options, "project") ?? process.cwd());

  switch (command) {
    case "inspect":
      writeJson({ ok: true, projectRoot: project, inventory: await inspectProject(project) });
      break;
    case "init": {
      const input = await readJsonInput<ProjectAnalysisDraft>(requiredOption(options, "input"));
      writeJson(await initializeProject(project, input));
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
    case "authorization": {
      const action = requiredOption(options, "sol-advisor-implicit-delegation");
      if (action !== "enable" && action !== "remove") {
        throw new Error("--sol-advisor-implicit-delegation must be enable or remove.");
      }
      writeJson(await configureSolAdvisorImplicitDelegation(project, action));
      break;
    }
    case "match": {
      const prompt = requiredOption(options, "prompt");
      const rawLimit = option(options, "limit");
      const limit = rawLimit === undefined ? undefined : Number.parseInt(rawLimit, 10);
      if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
        throw new Error("--limit must be a non-negative integer.");
      }
      const matches = await matchHandoffs(project, prompt, limit);
      writeJson({ ok: true, projectRoot: project, matches });
      break;
    }
    case "handoff": {
      const inputPath = requiredOption(options, "input");
      const input = await readJsonInput<HandoffInput>(inputPath);
      writeJson(await createHandoff(project, input));
      break;
    }
    case "handoff-index": {
      const action = requiredOption(options, "action");
      if (action === "verify") {
        writeJson(await verifyHandoffIndex(project));
      } else if (action === "rebuild") {
        const index = await rebuildHandoffIndex(project);
        writeJson({ ok: true, action: "rebuilt", projectRoot: project, entryCount: index.entries.length });
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
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    const name = token.slice(2);
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
  codex-project-context init [--project PATH] --input FILE|-
  codex-project-context sync [--project PATH] --input FILE|-
  codex-project-context status [--project PATH]
  codex-project-context authorization [--project PATH] --sol-advisor-implicit-delegation enable|remove
  codex-project-context match [--project PATH] --prompt TEXT [--limit NUMBER]
  codex-project-context handoff [--project PATH] --input FILE|-
  codex-project-context handoff-index [--project PATH] --action verify|rebuild
  codex-project-context plan [--project PATH] --action create --input FILE|-
  codex-project-context plan [--project PATH] --action transition --id P001 --status STATUS --reason TEXT
  codex-project-context plan [--project PATH] --action list
`;
}
