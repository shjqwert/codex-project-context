import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
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

test("UserPromptSubmit injects each unchanged match set once per task", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-prompt-dedupe-"));
  const stateDirectory = await mkdtemp(join(tmpdir(), "codex-project-context-hook-state-"));
  await initializeProject(project);
  await createHandoff(project, handoffInput("HSS shutdown", "hss", "stopSession", "initial"));

  const first = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss stopSession work",
  }, undefined, stateDirectory);
  const repeated = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Inspect hss again",
  }, undefined, stateDirectory);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /W001/);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(repeated.stdout, "");

  await createHandoff(project, handoffInput("Transport startup", "transport", "startTransport", "transport"));
  const differentGroup = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue transport startTransport work",
  }, undefined, stateDirectory);
  assert.match(JSON.parse(differentGroup.stdout).hookSpecificOutput.additionalContext, /W002/);

  const originalStillSuppressed = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  assert.equal(originalStillSuppressed.stdout, "");

  await createHandoff(project, handoffInput("HSS shutdown follow-up", "hss", "stopSession", "follow-up"));
  const changedRecords = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  const changedContext = JSON.parse(changedRecords.stdout).hookSpecificOutput.additionalContext;
  assert.match(changedContext, /W001/);
  assert.match(changedContext, /W003/);

  const newTask = runHook("user-prompt-submit.js", {
    session_id: "session-b",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  assert.match(JSON.parse(newTask.stdout).hookSpecificOutput.additionalContext, /W003/);

  const compact = runHook("session-start.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "SessionStart",
    source: "compact",
  }, undefined, stateDirectory);
  assert.equal(compact.status, 0, compact.stderr);
  const afterCompact = runHook("user-prompt-submit.js", {
    session_id: "session-a",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  assert.match(JSON.parse(afterCompact.stdout).hookSpecificOutput.additionalContext, /W003/);

  const missingSessionFirst = runHook("user-prompt-submit.js", {
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  const missingSessionSecond = runHook("user-prompt-submit.js", {
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss work",
  }, undefined, stateDirectory);
  assert.notEqual(missingSessionFirst.stdout, "");
  assert.notEqual(missingSessionSecond.stdout, "");

  const storedState = [];
  for (const sessionEntry of await readdir(stateDirectory, { withFileTypes: true })) {
    if (!sessionEntry.isDirectory()) continue;
    for (const marker of await readdir(join(stateDirectory, sessionEntry.name))) {
      storedState.push(`${sessionEntry.name}/${marker}`);
      storedState.push(await readFile(join(stateDirectory, sessionEntry.name, marker), "utf8"));
    }
  }
  assert.doesNotMatch(storedState.join("\n"), /hss|stopSession|Continue/iu);
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

test("UserPromptSubmit deduplicates BM25 matches and keeps lexical queries read-only", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-bm25-hook-"));
  const stateDirectory = await mkdtemp(join(tmpdir(), "codex-project-context-bm25-hook-state-"));
  await initializeProject(project);
  await createHandoff(project, {
    ...handoffInput("Thermal motor restart diagnostics", "DriveSupervisor", "restartMotor", "thermal"),
    summary: "PWM output stays disabled until current samples fall below the safety threshold.",
    tags: ["overcurrent", "safe-restart"],
    tests: ["cold restart safety"],
  });
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const before = await readFile(indexPath, "utf8");
  const input = {
    session_id: "bm25-hook-session",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "thermal current threshold safe restart",
  };
  const first = runHook("user-prompt-submit.js", input, undefined, stateDirectory);
  const repeated = runHook("user-prompt-submit.js", input, undefined, stateDirectory);
  const broad = runHook("user-prompt-submit.js", {
    ...input,
    prompt: "evidence",
  }, undefined, stateDirectory);

  assert.equal(first.status, 0, first.stderr);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /bm25 lexical/);
  assert.equal(repeated.stdout, "");
  assert.equal(broad.stdout, "");
  assert.equal(await readFile(indexPath, "utf8"), before);
});

test("UserPromptSubmit retrieves bilingual aliases without emitting alias lists or repeated context", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-alias-hook-"));
  const stateDirectory = await mkdtemp(join(tmpdir(), "codex-project-context-alias-hook-state-"));
  await initializeProject(project);
  await createHandoff(project, {
    ...handoffInput("Motor overcurrent restart", "DriveSupervisor", "restartMotor", "alias"),
    aliases: [
      "电机过流安全重启",
      "电流恢复后重新启动",
      "motor safety restart",
      "restart after current recovery",
    ],
  });
  const chineseInput = {
    session_id: "alias-hook-session",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "检查电机过流安全重启状态",
  };
  const first = runHook("user-prompt-submit.js", chineseInput, undefined, stateDirectory);
  const repeated = runHook("user-prompt-submit.js", chineseInput, undefined, stateDirectory);
  const exact = runHook("user-prompt-submit.js", {
    ...chineseInput,
    session_id: "alias-hook-exact-session",
    prompt: "Continue W001",
  }, undefined, stateDirectory);

  assert.equal(first.status, 0, first.stderr);
  const aliasContext = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
  const exactContext = JSON.parse(exact.stdout).hookSpecificOutput.additionalContext;
  assert.match(aliasContext, /bm25 lexical/);
  assert.doesNotMatch(aliasContext, /电机过流安全重启|电流恢复后重新启动|motor safety restart|restart after current recovery/u);
  assert.ok(aliasContext.length <= exactContext.length + 120, `Alias Hook context grew unexpectedly: ${aliasContext.length}`);
  assert.ok(aliasContext.length < 1_400);
  assert.equal(repeated.stdout, "");
});

test("UserPromptSubmit remains read-only when matching from a missing index", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-missing-index-hook-"));
  await initializeProject(project);
  await createHandoff(project, handoffInput("HSS shutdown", "hss", "stopSession", "missing-index"));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  await unlink(indexPath);

  const result = runHook("user-prompt-submit.js", {
    session_id: "missing-index-session",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue hss stopSession",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /W001/);
  await assert.rejects(access(indexPath), /ENOENT/);
});

test("UserPromptSubmit stays below its timeout with 1000 lightweight index entries", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-large-hook-"));
  const stateDirectory = await mkdtemp(join(tmpdir(), "codex-project-context-large-hook-state-"));
  await initializeProject(project);
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const diagnosticPath = join(stateDirectory, "errors.jsonl");
  const entries = Array.from({ length: 1_000 }, (_, index) => largeIndexEntry(index + 1));
  await writeFile(indexPath, `${JSON.stringify({ schemaVersion: 3, entries }, null, 2)}\n`, "utf8");
  const before = await readFile(indexPath, "utf8");
  const started = performance.now();
  const result = runHook("user-prompt-submit.js", {
    session_id: "large-index-session",
    cwd: project,
    hook_event_name: "UserPromptSubmit",
    prompt: "channel 777 thermal shutdown",
  }, diagnosticPath, stateDirectory);
  const elapsed = performance.now() - started;

  assert.equal(result.status, 0, result.stderr);
  assert.ok(elapsed < 5_000, `Hook exceeded its five-second timeout: ${elapsed} ms`);
  if (result.stdout === "") {
    assert.fail(`Hook failed open unexpectedly: ${await readFile(diagnosticPath, "utf8")}`);
  }
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /W777/);
  assert.equal(await readFile(indexPath, "utf8"), before);
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

function handoffInput(title, module, symbol, suffix) {
  return {
    title,
    summary: `Verified ${suffix} handoff evidence.`,
    kind: "verification",
    modules: [module],
    symbols: [symbol],
    sections: {
      objective: `Continue ${suffix} verification.`,
      currentState: `${suffix} evidence is available.`,
      remainingWork: `Use the ${suffix} evidence when relevant.`,
    },
  };
}

function largeIndexEntry(index) {
  const id = `W${String(index).padStart(3, "0")}`;
  return {
    id,
    cycle: "development",
    title: `Motor thermal recovery channel ${index}`,
    summary: `Channel ${index} preserves thermal shutdown diagnostics and recovery evidence.`,
    kind: "verification",
    routing: {
      specRefs: [],
      bugIds: [],
      modules: [`motor-${index % 20}`],
      files: [],
      symbols: [],
      tests: [`recovery-${index % 50}`],
      tags: [index % 2 === 0 ? "thermal" : "diagnostic"],
      aliases: [`通道${index}热恢复`, `thermal recovery channel ${index}`],
    },
    availableSections: ["objective", "currentState", "remainingWork"],
    groupKey: `title:performance-${index}`,
    dedupeKey: `sha256:${index.toString(16).padStart(64, "0")}`,
    path: `.agent/handoff/records/development/${id}.md`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString(),
  };
}

function runHook(file, input, diagnosticPath, stateDirectory) {
  return spawnSync(process.execPath, [resolve("dist", "hooks", file)], {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...process.env,
      ...(diagnosticPath === undefined ? {} : { CODEX_PROJECT_CONTEXT_HOOK_LOG: diagnosticPath }),
      ...(stateDirectory === undefined ? {} : { CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR: stateDirectory }),
    },
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
