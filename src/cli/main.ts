#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin } from "node:process";
import { createHandoff, matchHandoffs } from "../application/handoffs.js";
import { getProjectStatus, initializeProject, synchronizeProject } from "../application/project-context.js";
import type { HandoffInput } from "../types.js";

const VERSION = "0.1.0";

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
    case "init":
      writeJson(await initializeProject(project));
      break;
    case "sync":
      writeJson(await synchronizeProject(project));
      break;
    case "status":
      writeJson(await getProjectStatus(project));
      break;
    case "match": {
      const prompt = requiredOption(options, "prompt");
      const limit = Number.parseInt(option(options, "limit") ?? "3", 10);
      if (!Number.isFinite(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
      const matches = await matchHandoffs(project, prompt, limit);
      writeJson({ ok: true, projectRoot: project, matches });
      break;
    }
    case "handoff": {
      const inputPath = requiredOption(options, "input");
      const input = await readHandoffInput(inputPath);
      writeJson(await createHandoff(project, input));
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

async function readHandoffInput(inputPath: string): Promise<HandoffInput> {
  const text = inputPath === "-" ? await readStandardInput() : await readFile(resolve(inputPath), "utf8");
  return JSON.parse(text) as HandoffInput;
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
  codex-project-context init [--project PATH]
  codex-project-context sync [--project PATH]
  codex-project-context status [--project PATH]
  codex-project-context match [--project PATH] --prompt TEXT [--limit NUMBER]
  codex-project-context handoff [--project PATH] --input FILE|-
`;
}

