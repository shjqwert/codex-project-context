import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createHandoff } from "../dist/application/handoffs.js";
import { initializeAnalyzedProject as initializeProject } from "./helpers/project-analysis.mjs";

test("SessionStart emits concise context only for initialized projects", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-hook-"));
  await initializeProject(project);

  const result = runHook("session-start.js", {
    cwd: project,
    hook_event_name: "SessionStart",
    source: "startup",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /handoff index/i);
});

test("UserPromptSubmit emits matching handoff cards and stays silent otherwise", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-prompt-hook-"));
  await initializeProject(project);
  await createHandoff(project, {
    title: "HSS shutdown",
    summary: "Verified stopSession cleanup.",
    kind: "verification",
    modules: ["hss"],
    symbols: ["stopSession"],
    sections: {
      objective: "Continue HSS shutdown verification.",
      currentState: "stopSession cleanup is verified.",
      remainingWork: "Run the broader shutdown suite.",
    },
  });

  const matched = runHook("user-prompt-submit.js", {
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue the hss stopSession work",
  });
  assert.equal(matched.status, 0, matched.stderr);
  assert.match(JSON.parse(matched.stdout).hookSpecificOutput.additionalContext, /W001/);

  const unrelated = runHook("user-prompt-submit.js", {
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Write release notes",
  });
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.equal(unrelated.stdout, "");
});

test("UserPromptSubmit reports truncation without changing the complete handoff index", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-overflow-hook-"));
  await initializeProject(project);
  for (let index = 1; index <= 8; index += 1) {
    await createHandoff(project, {
      title: `Overflow routing record ${index}`,
      summary: `Verified overflow routing evidence for independent symbol ${index}.`,
      kind: "verification",
      modules: ["stage8-overflow"],
      symbols: [`OverflowSymbol${index}`],
      sections: {
        objective: `Preserve routing evidence for symbol ${index}.`,
        currentState: `The independent routing record ${index} is available.`,
        remainingWork: `Use record ${index} when its symbol is relevant.`,
      },
    });
  }

  const indexPath = join(project, ".agent", "handoff", "index.json");
  const before = await readFile(indexPath, "utf8");
  const result = runHook("user-prompt-submit.js", {
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue stage8-overflow work",
  });
  const after = await readFile(indexPath, "utf8");

  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Matched 8 work group\(s\) and 8 record\(s\)/);
  assert.match(context, /Hook routing output was truncated/);
  assert.match(context, /handoff match CLI with the current prompt/);
  assert.equal(after, before);
});

test("hooks fail open and append bounded local diagnostics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codex-project-context-hook-errors-"));
  const diagnosticPath = join(directory, "hook-errors.jsonl");
  const malformed = runRawHook("user-prompt-submit.js", "not-json", diagnosticPath);
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.equal(malformed.stdout, "");
  assert.equal(malformed.stderr, "");

  const project = await mkdtemp(join(tmpdir(), "codex-project-context-hook-index-"));
  await initializeProject(project);
  const indexPath = join(project, ".agent", "handoff", "index.json");
  await writeFile(indexPath, "{ invalid index", "utf8");
  const invalidIndex = runHook(
    "user-prompt-submit.js",
    {
      cwd: project,
      hook_event_name: "UserPromptSubmit",
      prompt: "Continue W001",
    },
    diagnosticPath,
  );
  assert.equal(invalidIndex.status, 0, invalidIndex.stderr);
  assert.equal(invalidIndex.stdout, "");
  assert.equal(invalidIndex.stderr, "");

  const records = (await readFile(diagnosticPath, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ eventName }) => eventName), ["UserPromptSubmit", "UserPromptSubmit"]);
  assert.ok(records.every(({ message }) => typeof message === "string" && message.length <= 1_000));
  assert.doesNotMatch(JSON.stringify(records), /not-json|Continue W001/);
});

function runHook(file, input, diagnosticPath) {
  return spawnSync(process.execPath, [resolve("dist", "hooks", file)], {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: "utf8",
    env: diagnosticPath === undefined
      ? process.env
      : { ...process.env, CODEX_PROJECT_CONTEXT_HOOK_LOG: diagnosticPath },
  });
}

function runRawHook(file, input, diagnosticPath) {
  return spawnSync(process.execPath, [resolve("dist", "hooks", file)], {
    cwd: process.cwd(),
    input,
    encoding: "utf8",
    env: { ...process.env, CODEX_PROJECT_CONTEXT_HOOK_LOG: diagnosticPath },
  });
}
