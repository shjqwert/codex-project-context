import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import {
  createHandoff,
  getHandoffHistory,
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
  const project = await makeTempDirectory("codex-project-context-match-");
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
  assert.equal(byId[0]?.entry.workId, "W001");
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
  assert.equal(exactAboveLexical[0]?.entry.workId, "W001");
  assert.equal(exactAboveLexical[0]?.score, 100);
  assert.ok(exactAboveLexical.some(({ entry, score }) => entry.workId === "W002" && score < 60));

  const unrelated = await matchHandoffs(project, "Update the release notes.");
  assert.deepEqual(unrelated, []);
});

test("initialization preserves user-authored AGENTS content", async () => {
  const project = await makeTempDirectory("codex-project-context-agents-");
  const agentsPath = join(project, "AGENTS.md");
  await writeFile(agentsPath, "# User Rules\n\nKeep this line.\n", "utf8");
  await initializeProject(project);
  await initializeProject(project);

  const content = await readFile(agentsPath, "utf8");
  assert.match(content, /Keep this line\./);
  assert.equal(content.match(/PROJECT_CONTEXT_START/g)?.length, 1);
});

test("initialization rejects configured paths outside the project", async () => {
  const project = await makeTempDirectory("codex-project-context-paths-");
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
  const project = await makeTempDirectory("codex-project-context-aggregate-");
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
    workId: "W001",
    expectedRevision: 1,
    files: ["src/session.ts"],
    symbols: ["stopSession"],
    sections: { risks: "The integration suite has not run." },
  }));

  const matches = await matchHandoffs(project, "Continue stopSession revised work");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].entry.workId, "W001");
  assert.equal(matches[0].entry.revision, 2);
  assert.deepEqual(matches[0].records.map(({ workId, revision }) => [workId, revision]), [["W001", 2]]);
  assert.ok(matches[0].records[0].availableSections.includes("risks"));
});

test("matching uses token boundaries and rejects unsupported index schemas", async () => {
  const project = await makeTempDirectory("codex-project-context-migrate-");
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
  const project = await makeTempDirectory("codex-project-context-dedupe-");
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

  assert.deepEqual(new Set(results.map(({ workId }) => workId)), new Set(["W001"]));
  assert.equal(results.filter(({ deduplicated }) => !deduplicated).length, 1);
  assert.equal(reordered.workId, "W001");
  assert.equal(reordered.deduplicated, true);
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.deepEqual(index.entries.map(({ workId }) => workId), ["W001"]);
  assert.equal(index.entries[0].dedupeKey.startsWith("sha256:"), true);
  assert.deepEqual(
    await readdir(join(project, ".agent", "handoff", "current", "development")),
    ["W001-session-cleanup.md"],
  );
  assert.ok((await readdir(join(project, ".agent", ".project-context-write.lock")))
    .some((name) => /^generation-[1-9][0-9]*\.released$/u.test(name)));
});

test("matching supports Chinese phrases and returns the complete most recent group", async () => {
  const project = await makeTempDirectory("codex-project-context-fuzzy-");
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
  assert.equal(chinese[0]?.entry.workId, "W002");
  assert.match(chinese[0]?.reasons[0] ?? "", /bm25 lexical/);
  assert.ok((chinese[0]?.matchedTerms?.length ?? 0) >= 2);

  const recent = await matchHandoffs(project, "继续上次的工作");
  assert.equal(recent.length, 1);
  assert.equal(recent[0].entry.workId, "W002");
  assert.deepEqual(recent[0].reasons, ["recent continuation cue"]);
  assert.deepEqual(recent[0].records.map(({ workId }) => workId), ["W002"]);
});

test("matching returns all reliable groups without a default record-count limit", async () => {
  const project = await makeTempDirectory("codex-project-context-unlimited-");
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
  const project = await makeTempDirectory("codex-project-context-bm25-match-");
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
  const recordsDirectory = join(project, ".agent", "handoff", "current", "development");
  const beforeIndex = await readFile(indexPath, "utf8");
  const beforeRecords = await Promise.all(
    (await readdir(recordsDirectory)).map(async (name) => [name, await readFile(join(recordsDirectory, name), "utf8")]),
  );

  const natural = await matchHandoffs(project, "thermal current threshold safe restart");
  assert.equal(natural[0]?.entry.workId, "W001");
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
  const project = await makeTempDirectory("codex-project-context-aliases-");
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
  const createdPath = join(project, ".agent", "handoff", "current", "development", "W001-motor-overcurrent-safe-restart.md");
  const body = (await readFile(createdPath, "utf8")).split(/^---$/mu).slice(2).join("---");

  const chinese = await matchHandoffs(project, "确认电机过流安全重启路径");
  assert.equal(chinese[0]?.entry.workId, "W001");
  assert.equal(chinese[0]?.score, 30);
  assert.match(chinese[0]?.reasons[0] ?? "", /bm25 lexical/);
  assert.equal((await matchHandoffs(project, "motor safety restart"))[0]?.entry.workId, "W001");
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
  assert.equal(duplicate.workId, "W001");
  assert.equal(duplicate.deduplicated, true);
  assert.deepEqual(
    await readdir(join(project, ".agent", "handoff", "current", "development")),
    ["W001-motor-overcurrent-safe-restart.md"],
  );
  assert.equal((await verifyHandoffIndex(project)).workCount, 1);

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

test("single-language current records verify and rebuild without rewriting", async () => {
  const project = await makeTempDirectory("codex-project-context-legacy-alias-");
  await initializeProject(project);
  const created = await createHandoff(project, completeInput({
    title: "Router evidence",
    summary: "Confirmed router evidence.",
    files: ["src/router.ts"],
  }));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const currentPath = join(project, ".agent", "handoff", "current", "development", "W001-router-evidence.md");
  const legacyMarkdown = (await readFile(currentPath, "utf8")).replace(/^aliases: \[\]\r?\n/mu, "");
  const legacyIndex = JSON.parse(await readFile(indexPath, "utf8"));
  delete legacyIndex.entries[0].routing.aliases;
  await writeFile(currentPath, legacyMarkdown, "utf8");
  await writeFile(indexPath, `${JSON.stringify(legacyIndex, null, 2)}\n`, "utf8");

  assert.equal((await verifyHandoffIndex(project)).workCount, 1);
  assert.equal((await matchHandoffs(project, "Inspect src/router.ts"))[0]?.entry.workId, "W001");
  await unlink(indexPath);
  const rebuilt = await rebuildHandoffIndex(project);
  assert.deepEqual(rebuilt.entries[0]?.routing.aliases, []);
  assert.doesNotMatch(await readFile(currentPath, "utf8"), /^aliases:/mu);
});

test("BM25 close leaders return every reliable work group instead of forcing one", async () => {
  const project = await makeTempDirectory("codex-project-context-bm25-tie-");
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
  assert.deepEqual(matches.map(({ entry }) => entry.workId).sort(), ["W001", "W002"]);
  assert.ok(matches.every(({ score }) => score === 30));
});

test("records omit empty sections and rebuild a missing index without Hook-style writes", async () => {
  const project = await makeTempDirectory("codex-project-context-rebuild-");
  await initializeProject(project);
  const created = await createHandoff(project, completeInput({
    title: "Router evidence",
    summary: "Confirmed router evidence.",
    files: ["src/router.ts"],
  }));
  const currentPath = join(project, ".agent", "handoff", "current", "development", "W001-router-evidence.md");
  const markdown = await readFile(currentPath, "utf8");
  assert.doesNotMatch(markdown, /未记录|根因未确认|## Bug 诊断/u);
  assert.match(markdown, /## 目标[\s\S]*## 当前状态[\s\S]*## 剩余工作/u);

  assert.equal((await verifyHandoffIndex(project)).workCount, 1);
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const stableIndex = await readFile(indexPath, "utf8");
  await writeFile(
    currentPath,
    markdown.replace(
      'available_sections: ["objective","currentState","remainingWork"]',
      'available_sections: ["objective","currentState"]',
    ),
    "utf8",
  );
  await assert.rejects(rebuildHandoffIndex(project), /available_sections does not match/);
  assert.equal(await readFile(indexPath, "utf8"), stableIndex);
  await writeFile(currentPath, markdown, "utf8");

  await unlink(indexPath);
  const inMemoryMatch = await matchHandoffs(project, "Continue src/router.ts");
  assert.equal(inMemoryMatch[0]?.entry.workId, "W001");
  await assert.rejects(access(indexPath), /ENOENT/);

  const rebuilt = await rebuildHandoffIndex(project);
  assert.equal(rebuilt.entries[0]?.workId, "W001");
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).schemaVersion, 5);
});

test("current updates use revisions, Chinese headings, checkpoints, and structured conflicts", async () => {
  const project = await makeTempDirectory("codex-project-context-current-update-");
  await initializeProject(project);
  const created = await createHandoff(project, completeInput({
    title: "路由器状态",
    summary: "路由器初始状态已确认。",
    files: ["src/router.ts"],
    aliases: ["路由状态延续", "路由入口验证", "router state continuation", "router entry verification"],
  }));
  assert.deepEqual(
    { action: created.action, workId: created.workId, revision: created.revision, status: created.status },
    { action: "created", workId: "W001", revision: 1, status: "active" },
  );

  const updateInput = completeInput({
    title: "路由器状态已阻塞",
    summary: "等待上游接口定义。",
    workId: "W001",
    expectedRevision: 1,
    status: "blocked",
    checkpoint: true,
    checkpointReason: "接口边界已经确认，进入等待状态。",
    files: ["src/router.ts"],
    sections: { decisionsAndConstraints: "不得猜测上游接口。" },
  });
  const updated = await createHandoff(project, updateInput);
  assert.equal(updated.action, "updated");
  assert.equal(updated.revision, 2);
  assert.match(updated.snapshotPath ?? "", /history\/development\/W001\/R0002\.md$/u);
  assert.equal(updated.checkpointReason, "接口边界已经确认，进入等待状态。");

  const currentPath = join(project, ".agent", "handoff", "current", "development", "W001-路由器状态.md");
  const current = await readFile(currentPath, "utf8");
  assert.match(current, /revision: 2/u);
  assert.match(current, /status: "blocked"/u);
  assert.match(current, /## 目标[\s\S]*## 当前状态[\s\S]*## 决策与约束/u);
  assert.doesNotMatch(current, /接口边界已经确认，进入等待状态。/u);

  const conflict = await createHandoff(project, { ...updateInput, summary: "陈旧窗口提交。" });
  assert.deepEqual(
    { ok: conflict.ok, action: conflict.action, expectedRevision: conflict.expectedRevision, actualRevision: conflict.actualRevision },
    { ok: false, action: "conflict", expectedRevision: 1, actualRevision: 2 },
  );
  const deduplicated = await createHandoff(project, {
    ...updateInput,
    expectedRevision: 2,
    checkpoint: undefined,
    checkpointReason: undefined,
  });
  assert.equal(deduplicated.action, "deduplicated");
  assert.equal(deduplicated.revision, 2);

  const history = await getHandoffHistory(project, "W001");
  assert.deepEqual(history.records.map(({ revision }) => revision), [2]);
  assert.match(await readFile(join(project, history.records[0].path), "utf8"), /record_type: "checkpoint"/u);
});

test("standalone checkpoints do not advance revisions and closed work requires explicit reopen", async () => {
  const project = await makeTempDirectory("codex-project-context-checkpoint-reopen-");
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "完成的路由修复",
    summary: "修复已经完成。",
    status: "completed",
  }));
  const checkpoint = await createHandoff(project, {
    workId: "W001",
    expectedRevision: 1,
    checkpointOnly: true,
    checkpointReason: "保存完成态。",
  });
  assert.equal(checkpoint.action, "checkpointed");
  assert.equal(checkpoint.revision, 1);
  const repeated = await createHandoff(project, {
    workId: "W001",
    expectedRevision: 1,
    checkpointOnly: true,
    checkpointReason: "重复保存完成态。",
  });
  assert.equal(repeated.deduplicated, true);

  const changed = completeInput({
    title: "重新处理路由修复",
    summary: "发现需要继续处理。",
    workId: "W001",
    expectedRevision: 1,
    status: "active",
  });
  await assert.rejects(createHandoff(project, changed), /requires reopen/);
  const reopened = await createHandoff(project, { ...changed, reopen: true });
  assert.equal(reopened.revision, 2);
  assert.equal(reopened.status, "active");
});

test("concurrent stale updates allow one write and return one revision conflict", async () => {
  const project = await makeTempDirectory("codex-project-context-update-conflict-");
  await initializeProject(project);
  await createHandoff(project, completeInput({ title: "并发更新", summary: "初始状态。" }));
  const results = await Promise.all(["窗口甲", "窗口乙"].map((summary) => createHandoff(project, completeInput({
    title: "并发更新",
    summary,
    workId: "W001",
    expectedRevision: 1,
  }))));
  assert.equal(results.filter(({ action }) => action === "updated").length, 1);
  assert.equal(results.filter(({ action }) => action === "conflict").length, 1);
  assert.equal((await matchHandoffs(project, "继续并发更新"))[0]?.entry.revision, 2);
});

test("schema-v3 groups remain read-only until an explicit lazy v5 update", async () => {
  const project = await makeTempDirectory("codex-project-context-v3-lazy-");
  await initializeProject(project);
  const recordsDirectory = join(project, ".agent", "handoff", "records", "development");
  await mkdir(recordsDirectory, { recursive: true });
  const first = legacyEntry("W001", "旧路由基线", "2026-01-01T00:00:00.000Z");
  const second = legacyEntry("W010", "旧路由后续", "2026-01-02T00:00:00.000Z");
  await writeFile(join(project, first.path), renderLegacy(first), "utf8");
  await writeFile(join(project, second.path), renderLegacy(second), "utf8");
  await writeFile(
    join(project, ".agent", "handoff", "index.json"),
    `${JSON.stringify({ schemaVersion: 3, entries: [first, second] }, null, 2)}\n`,
    "utf8",
  );

  const legacyMatch = await matchHandoffs(project, "检查 legacyRouter");
  assert.equal(legacyMatch[0]?.entry.workId, "W001");
  assert.equal(legacyMatch[0]?.entry.revision, 2);
  await assert.rejects(access(join(project, ".agent", "handoff", "current")), /ENOENT/);

  const updated = await createHandoff(project, completeInput({
    title: "旧路由转为当前状态",
    summary: "显式更新后生成 current。",
    workId: "W001",
    expectedRevision: 2,
    symbols: ["legacyRouter"],
  }));
  assert.equal(updated.revision, 3);
  assert.equal(JSON.parse(await readFile(join(project, ".agent", "handoff", "index.json"), "utf8")).schemaVersion, 5);
  assert.deepEqual((await getHandoffHistory(project, "W010")).records.map(({ revision }) => revision), [1, 2]);
  assert.equal((await readFile(join(project, first.path), "utf8")).includes("schema_version: 1"), true);
});

test("a newer valid current repairs a stale index on access", async () => {
  const project = await makeTempDirectory("codex-project-context-index-repair-");
  await initializeProject(project);
  await createHandoff(project, completeInput({ title: "索引恢复", summary: "revision 1。", symbols: ["repairIndex"] }));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const staleIndex = await readFile(indexPath, "utf8");
  await createHandoff(project, completeInput({
    title: "索引恢复",
    summary: "revision 2。",
    workId: "W001",
    expectedRevision: 1,
    symbols: ["repairIndex"],
  }));
  const currentPath = join(project, ".agent", "handoff", "current", "development", "W001-索引恢复.md");
  const latestCurrent = await readFile(currentPath, "utf8");
  await writeFile(indexPath, staleIndex, "utf8");
  await unlink(currentPath);
  await writeFile(currentPath, latestCurrent, "utf8");

  const matched = await matchHandoffs(project, "检查 repairIndex");
  assert.equal(matched[0]?.entry.revision, 2);
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).entries[0].revision, 2);
});

test("corrupt current blocks injection without overwriting the file or index", async () => {
  const project = await makeTempDirectory("codex-project-context-corrupt-current-");
  await initializeProject(project);
  await createHandoff(project, completeInput({ title: "损坏保护", summary: "有效状态。", symbols: ["guardCurrent"] }));
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const beforeIndex = await readFile(indexPath, "utf8");
  const currentPath = join(project, ".agent", "handoff", "current", "development", "W001-损坏保护.md");
  await writeFile(currentPath, "invalid current\n", "utf8");

  await assert.rejects(matchHandoffs(project, "继续 W001 guardCurrent"), /invalid frontmatter/);
  await assert.rejects(createHandoff(project, completeInput({
    title: "损坏保护更新",
    summary: "不得覆盖损坏 current。",
    workId: "W001",
    expectedRevision: 1,
    symbols: ["guardCurrent"],
  })), /invalid frontmatter/);
  assert.equal(await readFile(currentPath, "utf8"), "invalid current\n");
  assert.equal(await readFile(indexPath, "utf8"), beforeIndex);
});

test("corrupt history is isolated from current matching and reported by verification", async () => {
  const project = await makeTempDirectory("codex-project-context-corrupt-history-");
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "历史隔离",
    summary: "当前状态有效。",
    symbols: ["isolateHistory"],
    checkpoint: true,
    checkpointReason: "保存关键状态。",
  }));
  const historyPath = join(project, ".agent", "handoff", "history", "development", "W001", "R0001.md");
  await writeFile(historyPath, "invalid history\n", "utf8");

  assert.equal((await matchHandoffs(project, "检查 isolateHistory"))[0]?.entry.workId, "W001");
  await assert.rejects(verifyHandoffIndex(project), /invalid frontmatter/);
});

test("lazy migration rejects a missing indexed legacy revision without writing v5 state", async () => {
  const project = await makeTempDirectory("codex-project-context-v3-missing-record-");
  await initializeProject(project);
  const recordsDirectory = join(project, ".agent", "handoff", "records", "development");
  await mkdir(recordsDirectory, { recursive: true });
  const first = legacyEntry("W001", "旧记录一", "2026-01-01T00:00:00.000Z");
  const missing = legacyEntry("W010", "缺失记录", "2026-01-02T00:00:00.000Z");
  await writeFile(join(project, first.path), renderLegacy(first), "utf8");
  const indexPath = join(project, ".agent", "handoff", "index.json");
  const v3Index = `${JSON.stringify({ schemaVersion: 3, entries: [first, missing] }, null, 2)}\n`;
  await writeFile(indexPath, v3Index, "utf8");

  await assert.rejects(createHandoff(project, completeInput({
    title: "不得迁移",
    summary: "缺少旧事实文件。",
    workId: "W001",
    expectedRevision: 2,
    symbols: ["legacyRouter"],
  })), /legacy source does not match/);
  assert.equal(await readFile(indexPath, "utf8"), v3Index);
  await assert.rejects(access(join(project, ".agent", "handoff", "current")), /ENOENT/);
});

test("history terms never enter default matching after current advances", async () => {
  const project = await makeTempDirectory("codex-project-context-history-isolation-");
  await initializeProject(project);
  await createHandoff(project, completeInput({
    title: "Quasar obsolete checkpoint",
    summary: "Quasar obsolete evidence is preserved only in history.",
    checkpoint: true,
    checkpointReason: "保存旧里程碑。",
  }));
  await createHandoff(project, completeInput({
    title: "当前路由结论",
    summary: "当前状态不再包含旧检索词。",
    workId: "W001",
    expectedRevision: 1,
  }));

  assert.deepEqual(await matchHandoffs(project, "quasar obsolete checkpoint"), []);
  assert.deepEqual((await getHandoffHistory(project, "W001")).records.map(({ revision }) => revision), [1]);
});

test("handoff creation rejects missing core sections, unknown fields, and escaping paths", async () => {
  const project = await makeTempDirectory("codex-project-context-input-guard-");
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

function legacyEntry(id, title, createdAt) {
  return {
    id,
    cycle: "development",
    title,
    summary: `${title}已记录。`,
    kind: "investigation",
    routing: {
      specRefs: [], bugIds: [], modules: ["legacy-router"], files: ["src/legacy.ts"],
      symbols: ["legacyRouter"], tests: [], tags: [], aliases: [],
    },
    availableSections: ["objective", "currentState", "remainingWork"],
    groupKey: "file-symbol:src/legacy.ts:legacyrouter",
    dedupeKey: `sha256:${id.slice(1).padStart(64, "0")}`,
    path: `.agent/handoff/records/development/${id}-${id.toLowerCase()}.md`,
    createdAt,
  };
}

function renderLegacy(entry) {
  return [
    "---",
    "schema_version: 1",
    `id: ${JSON.stringify(entry.id)}`,
    `title: ${JSON.stringify(entry.title)}`,
    `summary: ${JSON.stringify(entry.summary)}`,
    `created_at: ${JSON.stringify(entry.createdAt)}`,
    `cycle: ${JSON.stringify(entry.cycle)}`,
    `kind: ${JSON.stringify(entry.kind)}`,
    `group_key: ${JSON.stringify(entry.groupKey)}`,
    `dedupe_key: ${JSON.stringify(entry.dedupeKey)}`,
    `spec_refs: ${JSON.stringify(entry.routing.specRefs)}`,
    `bug_ids: ${JSON.stringify(entry.routing.bugIds)}`,
    `modules: ${JSON.stringify(entry.routing.modules)}`,
    `files: ${JSON.stringify(entry.routing.files)}`,
    `symbols: ${JSON.stringify(entry.routing.symbols)}`,
    `tests: ${JSON.stringify(entry.routing.tests)}`,
    `tags: ${JSON.stringify(entry.routing.tags)}`,
    `aliases: ${JSON.stringify(entry.routing.aliases)}`,
    `available_sections: ${JSON.stringify(entry.availableSections)}`,
    "---",
    "",
    `# ${entry.id} ${entry.title}`,
    "",
    `> ${entry.summary}`,
    "",
    "## Objective",
    "",
    "继续旧路由工作。",
    "",
    "## Current State",
    "",
    entry.summary,
    "",
    "## Remaining Work",
    "",
    "执行下一步验证。",
    "",
  ].join("\n");
}
