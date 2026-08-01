import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHandoff, matchHandoffs } from "../dist/application/handoffs.js";
import { initializeProject } from "../dist/application/project-context.js";

test("handoff matching prefers exact identifiers and file paths", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-match-"));
  await initializeProject(project);
  await createHandoff(project, {
    title: "Session cleanup",
    summary: "Preserve the existing error envelope.",
    modules: ["session"],
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    tests: ["session cleanup"],
    tags: ["lifecycle"],
  });

  const byId = await matchHandoffs(project, "Continue W001 and verify it.");
  assert.equal(byId[0]?.entry.id, "W001");
  assert.equal(byId[0]?.score, 100);

  const byPath = await matchHandoffs(project, "Inspect src/session.ts stopSession.");
  assert.equal(byPath[0]?.score, 270);
  assert.deepEqual(byPath[0]?.reasons, ["file path", "symbol", "module", "title"]);

  const unrelated = await matchHandoffs(project, "Update the release notes.");
  assert.deepEqual(unrelated, []);
});

test("initialization preserves user-authored AGENTS content", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-agents-"));
  const agentsPath = join(project, "AGENTS.md");
  await writeFile(agentsPath, "# User Rules\n\nKeep this line.\n", "utf8");
  await initializeProject(project);
  await initializeProject(project);

  const content = await readFile(agentsPath, "utf8");
  assert.match(content, /Keep this line\./);
  assert.equal(content.match(/PROJECT_CONTEXT_START/g)?.length, 1);
});

test("initialization rejects configured paths outside the project", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-paths-"));
  await mkdir(join(project, ".agent"), { recursive: true });
  await writeFile(
    join(project, ".agent", "context.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: ".",
      currentCycle: "development",
      agentsFile: "../outside.md",
      handoffIndex: ".agent/handoff/index.json",
      capabilities: { codegraph: false, serena: false, openspec: false },
    }),
    "utf8",
  );

  await assert.rejects(initializeProject(project), /must stay inside the project root/);
});
