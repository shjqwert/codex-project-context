import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHandoff, matchHandoffs } from "../dist/application/handoffs.js";
import { initializeProject, synchronizeProject } from "../dist/application/project-context.js";

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

test("matching aggregates duplicate handoffs and returns section-level hints", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-aggregate-"));
  await initializeProject(project);
  await createHandoff(project, {
    title: "Session cleanup baseline",
    summary: "Initial cleanup evidence.",
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { verification: "Focused cleanup test passed." },
  });
  await createHandoff(project, {
    title: "Session cleanup revised",
    summary: "Follow-up cleanup evidence.",
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { risks: "The integration suite has not run." },
  });

  const matches = await matchHandoffs(project, "Continue stopSession revised work");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].entry.id, "W002");
  assert.deepEqual(matches[0].relatedIds, ["W001"]);
  assert.deepEqual(
    matches[0].suggestedSections.map(({ name }) => name),
    ["Unresolved Facts and Risks", "Verification"],
  );
});

test("matching uses token boundaries and sync migrates schema v1 indexes", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-migrate-"));
  await initializeProject(project);
  const indexPath = join(project, ".agent", "handoff", "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          id: "W001",
          cycle: "development",
          title: "HSS routing",
          summary: "Legacy entry.",
          specRefs: [],
          bugIds: [],
          modules: ["hss"],
          files: [],
          symbols: [],
          testNames: [],
          tags: [],
          sections: [],
          path: ".agent/handoff/cycles/development/W001-hss-routing.md",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  assert.deepEqual(await matchHandoffs(project, "Update this router"), []);
  await synchronizeProject(project);
  const migrated = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.entries[0].sectionSummaries, []);
  assert.match(migrated.entries[0].groupKey, /^title:/);
});
