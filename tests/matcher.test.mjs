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
    files: ["src/runtime-cleanup.ts"],
    symbols: ["stopSession"],
    specRefs: ["SPEC-42"],
    bugIds: ["BUG-7"],
    tests: ["session cleanup"],
    tags: ["lifecycle"],
  }));

  const byId = await matchHandoffs(project, "Continue Ｗ００１ and verify it.");
  assert.equal(byId[0]?.entry.id, "W001");
  assert.equal(byId[0]?.score, 100);

  const bySpec = await matchHandoffs(project, "Continue SPEC-42.");
  assert.equal(bySpec[0]?.score, 100);
  assert.deepEqual(bySpec[0]?.reasons, ["spec id"]);

  const byBug = await matchHandoffs(project, "Investigate BUG-7.");
  assert.equal(byBug[0]?.score, 100);
  assert.deepEqual(byBug[0]?.reasons, ["bug id"]);

  const byPath = await matchHandoffs(project, "Inspect SRC\\RUNTIME-CLEANUP.TS.");
  assert.equal(byPath[0]?.score, 90);
  assert.deepEqual(byPath[0]?.reasons, ["file path"]);

  const bySymbol = await matchHandoffs(project, "Inspect stopSession.");
  assert.equal(bySymbol[0]?.score, 80);
  assert.deepEqual(bySymbol[0]?.reasons, ["symbol"]);

  const byModule = await matchHandoffs(project, "Continue SESSION.");
  assert.equal(byModule[0]?.score, 60);
  assert.deepEqual(byModule[0]?.reasons, ["module"]);

  const combined = await matchHandoffs(project, "Inspect src/runtime-cleanup.ts stopSession session.");
  assert.equal(combined[0]?.score, 230);
  assert.deepEqual(combined[0]?.reasons, ["file path", "symbol", "module"]);

  await createHandoff(project, completeInput({
    title: "Thermal restart diagnostics",
    summary: "Motor thermal restart evidence is available.",
    modules: ["motor-control"],
  }));
  const exactAboveLexical = await matchHandoffs(project, "Continue W001 thermal motor restart diagnostics");
  assert.equal(exactAboveLexical[0]?.entry.id, "W001");
  assert.equal(exactAboveLexical[0]?.score, 100);
  assert.ok(exactAboveLexical.some(({ entry, score }) => entry.id === "W002" && score < 60));

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
  assert.match(chinese[0]?.reasons[0] ?? "", /bm25 lexical/);
  assert.ok((chinese[0]?.matchedTerms?.length ?? 0) >= 2);

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

test("BM25 natural-language matching stays read-only and rejects broad or unrelated prompts", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-bm25-match-"));
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "Thermal motor restart diagnostics",
    summary: "PWM output stays disabled until current samples fall below the safety threshold.",
    modules: ["DriveSupervisor"],
    tags: ["overcurrent", "safe-restart"],
    tests: ["cold restart safety"],
  }));
  await createHandoff(project, completeInput({
    title: "CAN timeout recovery",
    summary: "The communication controller restarts after a receive timeout.",
    modules: ["CanSupervisor"],
    tags: ["communication"],
  }));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const recordsDirectory = join(project, ".agent", "handoff", "records", "development");
  const beforeIndex = await readFile(indexPath, "utf8");
  const beforeRecords = await Promise.all(
    (await readdir(recordsDirectory)).map(async (name) => [name, await readFile(join(recordsDirectory, name), "utf8")]),
  );

  const natural = await matchHandoffs(project, "thermal current threshold safe restart");
  assert.equal(natural[0]?.entry.id, "W001");
  assert.equal(natural[0]?.score, 30);
  assert.match(natural[0]?.reasons[0] ?? "", /bm25 lexical/);
  assert.ok((natural[0]?.lexicalScore ?? 0) >= 0.25);
  assert.ok((natural[0]?.matchedTerms?.length ?? 0) >= 2);
  assert.deepEqual(await matchHandoffs(project, "evidence"), []);
  assert.deepEqual(await matchHandoffs(project, "prepare unrelated release documentation"), []);

  assert.equal(await readFile(indexPath, "utf8"), beforeIndex);
  const afterRecords = await Promise.all(
    (await readdir(recordsDirectory)).map(async (name) => [name, await readFile(join(recordsDirectory, name), "utf8")]),
  );
  assert.deepEqual(afterRecords, beforeRecords);
});

test("bilingual aliases retrieve English handoffs and remain outside handoff identity", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-aliases-"));
  await initializeProject(project);
  const input = completeInput({
    title: "Motor overcurrent safe restart",
    summary: "PWM output remains disabled until sampled current falls below the safety threshold.",
    files: ["src/motor-supervisor.ts"],
    symbols: ["restartMotor"],
    aliases: [
      "电机过流安全重启",
      "电流恢复后重新启动",
      "motor safety restart",
      "restart after current recovery",
    ],
  });
  const created = await createHandoff(project, input);
  const body = (await readFile(created.path, "utf8")).split(/^---$/mu).slice(2).join("---");

  const chinese = await matchHandoffs(project, "确认电机过流安全重启路径");
  assert.equal(chinese[0]?.entry.id, "W001");
  assert.equal(chinese[0]?.score, 30);
  assert.match(chinese[0]?.reasons[0] ?? "", /bm25 lexical/);
  assert.equal((await matchHandoffs(project, "motor safety restart"))[0]?.entry.id, "W001");
  assert.equal((await matchHandoffs(project, "Continue W001"))[0]?.score, 100);
  assert.equal((await matchHandoffs(project, "Inspect src/motor-supervisor.ts"))[0]?.score, 90);
  assert.equal((await matchHandoffs(project, "Inspect restartMotor"))[0]?.score, 80);
  assert.deepEqual(await matchHandoffs(project, "处理"), []);
  assert.deepEqual(await matchHandoffs(project, "周末餐厅推荐"), []);
  assert.doesNotMatch(body, /电机过流安全重启|motor safety restart/u);

  const duplicate = await createHandoff(project, {
    ...input,
    aliases: [
      "  RESTART   AFTER CURRENT RECOVERY  ",
      "ＭＯＴＯＲ　ＳＡＦＥＴＹ　ＲＥＳＴＡＲＴ",
      "电流恢复后重新启动",
      "电机过流安全重启",
    ],
  });
  assert.equal(duplicate.id, "W001");
  assert.equal(duplicate.deduplicated, true);
  assert.deepEqual(
    await readdir(join(project, ".agent", "handoff", "records", "development")),
    ["W001-motor-overcurrent-safe-restart.md"],
  );
  assert.equal((await verifyHandoffIndex(project)).entryCount, 1);

  await assert.rejects(createHandoff(project, completeInput({
    title: "Broad aliases",
    summary: "This input must be rejected.",
    aliases: ["功能", "feature"],
  })), /broad retrieval terms/);
  await assert.rejects(createHandoff(project, completeInput({
    title: "Single language aliases",
    summary: "This input must also be rejected.",
    aliases: ["motor safety restart", "restart after current recovery"],
  })), /both Chinese and English/);
  await assert.rejects(createHandoff(project, completeInput({
    title: "Duplicated alias phrase",
    summary: "This input repeats its title as an alias.",
    aliases: ["duplicated alias phrase", "重复别名短语"],
  })), /must not duplicate the title or summary/);
});

test("legacy single-language records verify and rebuild without migration", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-legacy-alias-"));
  await initializeProject(project);
  const created = await createHandoff(project, completeInput({
    title: "Router evidence",
    summary: "Confirmed router evidence.",
    files: ["src/router.ts"],
  }));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const legacyMarkdown = (await readFile(created.path, "utf8")).replace(/^aliases: \[\]\r?\n/mu, "");
  const legacyIndex = JSON.parse(await readFile(indexPath, "utf8"));
  delete legacyIndex.entries[0].routing.aliases;
  await writeFile(created.path, legacyMarkdown, "utf8");
  await writeFile(indexPath, `${JSON.stringify(legacyIndex, null, 2)}\n`, "utf8");

  assert.equal((await verifyHandoffIndex(project)).entryCount, 1);
  assert.equal((await matchHandoffs(project, "Inspect src/router.ts"))[0]?.entry.id, "W001");
  await unlink(indexPath);
  const rebuilt = await rebuildHandoffIndex(project);
  assert.deepEqual(rebuilt.entries[0]?.routing.aliases, []);
  assert.doesNotMatch(await readFile(created.path, "utf8"), /^aliases:/mu);
});

test("BM25 close leaders return every reliable work group instead of forcing one", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-bm25-tie-"));
  await initializeProject(project);
  for (const [file, symbol] of [["src/motor-a.ts", "recoverMotorA"], ["src/motor-b.ts", "recoverMotorB"]]) {
    await createHandoff(project, completeInput({
      title: "Motor thermal recovery",
      summary: "Thermal shutdown recovery is confirmed.",
      files: [file],
      symbols: [symbol],
    }));
  }
  const matches = await matchHandoffs(project, "motor thermal recovery");
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(({ entry }) => entry.id).sort(), ["W001", "W002"]);
  assert.ok(matches.every(({ score }) => score === 30));
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
