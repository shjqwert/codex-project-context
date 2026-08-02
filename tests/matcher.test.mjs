import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createHandoff,
  matchHandoffs,
  rebuildHandoffIndex,
  verifyHandoffIndex,
} from "../dist/application/handoffs.js";
import {
  initializeAnalyzedProject as initializeProject,
  synchronizeAnalyzedProject as synchronizeProject,
} from "./helpers/project-analysis.mjs";

function completeInput(input) {
  return {
    kind: "investigation",
    ...input,
    sections: {
      objective: "Continue the recorded work.",
      currentState: input.summary,
      remainingWork: "Complete the next relevant verification step.",
      ...input.sections,
    },
  };
}

test("handoff matching prefers exact identifiers and file paths", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-match-"));
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "Session cleanup",
    summary: "Preserve the existing error envelope.",
    modules: ["session"],
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    tests: ["session cleanup"],
    tags: ["lifecycle"],
  }));

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

test("matching aggregates related handoffs and returns every record reference", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-aggregate-"));
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "Session cleanup baseline",
    summary: "Initial cleanup evidence.",
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { verification: "Focused cleanup test passed." },
  }));
  await createHandoff(project, completeInput({
    title: "Session cleanup revised",
    summary: "Follow-up cleanup evidence.",
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { risks: "The integration suite has not run." },
  }));

  const matches = await matchHandoffs(project, "Continue stopSession revised work");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].entry.id, "W002");
  assert.deepEqual(matches[0].records.map(({ id }) => id), ["W002", "W001"]);
  assert.ok(matches[0].records[0].availableSections.includes("risks"));
  assert.ok(matches[0].records[1].availableSections.includes("verification"));
});

test("matching uses token boundaries and rejects unsupported index schemas", async () => {
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

  await assert.rejects(matchHandoffs(project, "Update this router"), /schemaVersion 3/);
  await assert.rejects(synchronizeProject(project), /schemaVersion 3/);
});

test("concurrent equivalent handoffs create one durable record", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-dedupe-"));
  await initializeProject(project);
  const input = completeInput({
    title: "Session cleanup",
    summary: "Verified cleanup state.",
    modules: ["session", "transport"],
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { verification: "Focused cleanup test passed." },
  });

  const results = await Promise.all(Array.from({ length: 8 }, () => createHandoff(project, input)));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const reordered = await createHandoff(project, {
    ...input,
    title: "  SESSION   CLEANUP ",
    modules: ["transport", "session"],
  });

  assert.deepEqual(new Set(results.map(({ id }) => id)), new Set(["W001"]));
  assert.equal(results.filter(({ deduplicated }) => !deduplicated).length, 1);
  assert.equal(reordered.id, "W001");
  assert.equal(reordered.deduplicated, true);
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.deepEqual(index.entries.map(({ id }) => id), ["W001"]);
  assert.equal(index.entries[0].dedupeKey.startsWith("sha256:"), true);
  assert.deepEqual(
    await readdir(join(project, ".agent", "handoff", "records", "development")),
    ["W001-session-cleanup.md"],
  );
  await assert.rejects(access(join(project, ".agent", ".project-context-write.lock")), /ENOENT/);
});

test("matching supports Chinese phrases and returns the complete most recent group", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-fuzzy-"));
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "初始化检查",
    summary: "初始化已经完成。",
    modules: ["project-context"],
  }));
  await createHandoff(project, completeInput({
    title: "项目上下文幂等性验收",
    summary: "跨窗口 Hook 验收仍需继续。",
    modules: ["project-context"],
    tests: ["重复同步幂等性"],
  }));

  const chinese = await matchHandoffs(project, "继续幂等性测试");
  assert.equal(chinese[0]?.entry.id, "W002");
  assert.ok(chinese[0]?.reasons.includes("title") || chinese[0]?.reasons.includes("test name"));

  const recent = await matchHandoffs(project, "继续上次的工作");
  assert.equal(recent.length, 1);
  assert.equal(recent[0].entry.id, "W002");
  assert.deepEqual(recent[0].reasons, ["recent continuation cue"]);
  assert.deepEqual(recent[0].records.map(({ id }) => id), ["W002"]);
});

test("matching returns all reliable groups without a default record-count limit", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-unlimited-"));
  await initializeProject(project);
  for (let index = 1; index <= 7; index += 1) {
    await createHandoff(project, completeInput({
      title: `Router follow-up ${index}`,
      summary: `Confirmed router state ${index}.`,
      modules: ["router"],
    }));
  }

  const matches = await matchHandoffs(project, "Continue the router work");
  assert.equal(matches.length, 7);
  assert.equal((await matchHandoffs(project, "Continue the router work", 3)).length, 3);
});

test("records omit empty sections and rebuild a missing index without Hook-style writes", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-rebuild-"));
  await initializeProject(project);
  const created = await createHandoff(project, completeInput({
    title: "Router evidence",
    summary: "Confirmed router evidence.",
    files: ["src/router.ts"],
  }));
  const markdown = await readFile(created.path, "utf8");
  assert.doesNotMatch(markdown, /未记录|根因未确认|## Bug Diagnosis/u);
  assert.match(markdown, /## Objective[\s\S]*## Current State[\s\S]*## Remaining Work/u);

  assert.equal((await verifyHandoffIndex(project)).entryCount, 1);
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const stableIndex = await readFile(indexPath, "utf8");
  await writeFile(
    created.path,
    markdown.replace(
      'available_sections: ["objective","currentState","remainingWork"]',
      'available_sections: ["objective","currentState"]',
    ),
    "utf8",
  );
  await assert.rejects(rebuildHandoffIndex(project), /available_sections does not match/);
  assert.equal(await readFile(indexPath, "utf8"), stableIndex);
  await writeFile(created.path, markdown, "utf8");

  await unlink(indexPath);
  const inMemoryMatch = await matchHandoffs(project, "Continue src/router.ts");
  assert.equal(inMemoryMatch[0]?.entry.id, "W001");
  await assert.rejects(access(indexPath), /ENOENT/);

  const rebuilt = await rebuildHandoffIndex(project);
  assert.equal(rebuilt.entries[0]?.id, "W001");
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).schemaVersion, 3);
});

test("handoff creation rejects missing core sections, unknown fields, and escaping paths", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-input-guard-"));
  await initializeProject(project);
  await assert.rejects(createHandoff(project, {
    title: "Missing state",
    summary: "Incomplete input.",
    kind: "investigation",
    sections: { objective: "Continue.", remainingWork: "Inspect state." },
  }), /sections\.currentState/);
  await assert.rejects(createHandoff(project, completeInput({
    title: "Unknown field",
    summary: "Invalid input.",
    unexpected: true,
  })), /Unsupported handoff input field/);
  await assert.rejects(createHandoff(project, completeInput({
    title: "Escaping path",
    summary: "Invalid path.",
    files: ["../outside.ts"],
  })), /project-relative paths/);
});
