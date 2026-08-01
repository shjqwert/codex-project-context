import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createHandoff } from "../dist/application/handoffs.js";
import { initializeProject } from "../dist/application/project-context.js";

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
    modules: ["hss"],
    symbols: ["stopSession"],
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

function runHook(file, input) {
  return spawnSync(process.execPath, [resolve("dist", "hooks", file)], {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

