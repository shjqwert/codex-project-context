import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { rankHandoffsBm25 } from "../dist/application/bm25.js";
import { createHandoff, explainHandoffEntries, explainHandoffs, matchHandoffEntries } from "../dist/application/handoffs.js";
import { scoreRetrieval, passesRetrievalGate } from "../scripts/evaluate-retrieval.mjs";
import { initializeAnalyzedProject as initializeProject } from "./helpers/project-analysis.mjs";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";

const routing = { specRefs: [], bugIds: [], modules: [], files: [], symbols: [], tests: [], tags: [], aliases: [] };
function entry(workId, title, overrides = {}) {
  return { workId, title, summary: title, kind: "investigation", cycle: "development",
    status: "active", revision: 1, currentPath: `.agent/handoff/current/development/${workId}.md`,
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", legacyRecordIds: [],
    availableSections: ["objective", "currentState", "remainingWork"], groupKey: workId,
    dedupeKey: `sha256:${"a".repeat(64)}`, ...overrides, routing: { ...routing, ...overrides.routing } };
}
const ids = matches => matches.map(m => m.entry.workId).sort();

test("unknown topics stay in coverage and overlapping CJK grams do not multiply evidence", () => {
  const record = entry("W001", "项目上下文管理与交接检索");
  const result = rankHandoffsBm25([record], "交接检索 热电偶冷端补偿 校准电压漂移");
  assert.ok(result.queryTerms.includes("热电偶"));
  assert.equal(result.hits[0].inCorpusCoverage, 1);
  assert.ok(result.hits[0].termCoverage < 0.3);
  assert.ok(result.hits[0].matchedUnits <= 2);
  assert.deepEqual(matchHandoffEntries([record], "交接检索 热电偶冷端补偿 校准电压漂移"), []);
  assert.deepEqual(matchHandoffEntries([record], "不是交接检索，现在做热电偶冷端补偿"), []);
  assert.equal(ids(matchHandoffEntries([entry("W002", "并发更新")], "继续并发更新"))[0], "W002");
});

test("explicit exclusions override IDs, paths, symbols and modules without excluding failure descriptions", () => {
  const a = entry("W101", "Motor cannot start", { routing: { modules: ["motor"], files: ["src/motor.ts"], symbols: ["startMotor"] } });
  const b = entry("W102", "CAN timeout recovery", { routing: { modules: ["can"], files: ["src/can.ts"], symbols: ["startCan"] } });
  for (const query of ["不要继续 W101，处理 W102", "不要继续W101，处理W102", "请不要读取 W101，处理 W102", "skip W101 and inspect W102", "Do not read W101, inspect W102", "Don't continue src/motor.ts; inspect src/can.ts", "skip startMotor; inspect startCan", "不要 motor，CAN timeout recovery"]) {
    assert.deepEqual(ids(matchHandoffEntries([a, b], query)), ["W102"], query);
  }
  assert.deepEqual(ids(matchHandoffEntries([a, b], "motor cannot start")), ["W101"]);
  assert.deepEqual(ids(matchHandoffEntries([a, b], "请帮我不要读取 W101，处理 W102")), ["W102"]);
  assert.deepEqual(ids(matchHandoffEntries([a, b], "Motor cannot start, not calling startMotor")), ["W101"]);
  const diagnostic = explainHandoffEntries([a, b], "不要 W101，处理 W102");
  assert.equal(diagnostic.rejected.find(x => x.workId === "W101").reason, "explicit exclusion");
});

test("topic-qualified continuation never falls back to an unrelated recent work", () => {
  const old = entry("W101", "Motor thermal recovery");
  const recent = entry("W102", "CAN receive timeout", { updatedAt: "2026-08-02T00:00:00Z" });
  assert.deepEqual(ids(matchHandoffEntries([old, recent], "继续上次的工作")), ["W102"]);
  assert.deepEqual(ids(matchHandoffEntries([old, recent], "continue the previous task")), ["W102"]);
  assert.deepEqual(matchHandoffEntries([old, recent], "继续上次的热电偶冷端补偿"), []);
  assert.deepEqual(matchHandoffEntries([old, recent], "continue the previous thermocouple compensation"), []);
  for (const topic of ["CAN", "IT", "X"]) {
    const invoices = [entry("W111", "Invoice reminder scheduler")];
    assert.deepEqual(matchHandoffEntries(invoices, `continue the previous ${topic}`), []);
    assert.deepEqual(matchHandoffEntries(invoices, `继续上次的${topic}`), []);
  }
  assert.deepEqual(ids(matchHandoffEntries([old, recent], "continue the previous motor thermal recovery")), ["W101"]);
});

test("ambiguous objectives stay candidates while explicit multi-target and distinct topics remain complete", () => {
  const a = entry("W101", "Motor thermal recovery");
  const b = entry("W102", "Motor thermal recovery");
  const ambiguous = matchHandoffEntries([a, b], "motor thermal recovery");
  assert.deepEqual(ids(ambiguous), ["W101", "W102"]);
  assert.ok(ambiguous.every(m => m.disposition === "candidate"));
  const precise = matchHandoffEntries([a, b], "W101 and W102");
  assert.ok(precise.every(m => m.disposition === "reliable"));
  const c = entry("W103", "Socket drain shutdown");
  const distinct = matchHandoffEntries([a, c], "motor thermal recovery and socket drain shutdown");
  assert.deepEqual(ids(distinct), ["W101", "W103"]);
  assert.ok(distinct.every(m => m.disposition === "reliable"));
  for (const query of ["motor thermal recovery and socket drain shutdown", "W103 and motor thermal recovery"]) {
    const mixed = matchHandoffEntries([a, b, c], query);
    assert.deepEqual(ids(mixed), ["W101", "W102", "W103"]);
    assert.ok(mixed.filter(m => m.entry.workId !== "W103").every(m => m.disposition === "candidate"));
    assert.equal(mixed.find(m => m.entry.workId === "W103").disposition, "reliable");
  }
});

function input(title) { return { title, summary: title, kind: "investigation",
  sections: { objective: title, currentState: "Confirmed source.", remainingWork: "Continue review." } }; }

test("diagnostics reject stale current evidence without repairing the index and CLI explain is complete", async () => {
  const project = await makeTempDirectory("retrieval-explain-");
  await initializeProject(project);
  await createHandoff(project, input("Motor thermal recovery"));
  const path = join(project, ".agent/handoff/index.json");
  const before = await readFile(path, "utf8");
  await createHandoff(project, { ...input("Motor thermal recovery"), workId: "W001", expectedRevision: 1,
    sections: { ...input("Motor thermal recovery").sections, currentState: "Changed current." } });
  await writeFile(path, before);
  const diagnostic = await explainHandoffs(project, "W001");
  assert.deepEqual(diagnostic.matches, []);
  assert.match(diagnostic.storageWarning, /differ/);
  assert.equal(await readFile(path, "utf8"), before);
  const result = spawnSync(process.execPath, [resolve("dist/cli/main.js"), "match", "--project", project, "--prompt", "W001", "--explain"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).storageWarning, /differ/);
  assert.equal(await readFile(path, "utf8"), before);
  const invalid = spawnSync(process.execPath, [resolve("dist/cli/main.js"), "match", "--project", project, "--prompt", "W001", "--explain", "--limit", "1"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
});

test("candidate Hook cards do not instruct automatic reads and reliable promotion is not deduplicated away", async () => {
  const project = await makeTempDirectory("retrieval-candidate-hook-");
  const state = await makeTempDirectory("retrieval-candidate-state-");
  await initializeProject(project);
  await createHandoff(project, input("Motor thermal recovery"));
  await createHandoff(project, { ...input("Motor thermal recovery"), summary: "Different objective.",
    sections: { ...input("Motor thermal recovery").sections, objective: "A different motor target." } });
  const run = prompt => spawnSync(process.execPath, [resolve("dist/hooks/user-prompt-submit.js")], {
    input: JSON.stringify({ session_id: "candidate-promotion", cwd: project, hook_event_name: "UserPromptSubmit", prompt }),
    encoding: "utf8", env: { ...process.env, CODEX_HOME: state },
  });
  const first = run("motor thermal recovery");
  assert.equal(first.status, 0, first.stderr);
  const text = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /candidate-only/i);
  assert.doesNotMatch(text, /Read every reliably relevant/);
  const promoted = run("W001 and W002");
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.match(JSON.parse(promoted.stdout).hookSpecificOutput.additionalContext, /Read every reliably relevant/);
  assert.equal(run("W001 and W002").stdout, "");
});

test("diagnostics do not rebuild an existing index when the current directory is newer", async () => {
  const project = await makeTempDirectory("retrieval-explain-newer-dir-");
  await initializeProject(project);
  await createHandoff(project, input("Motor thermal recovery"));
  const indexPath = join(project, ".agent/handoff/index.json");
  const before = await readFile(indexPath, "utf8");
  await utimes(indexPath, new Date("2020-01-01"), new Date("2020-01-01"));
  await utimes(join(project, ".agent/handoff/current/development"), new Date(), new Date());
  const result = await explainHandoffs(project, "W001");
  assert.deepEqual(result.matches, []);
  assert.match(result.storageWarning, /differ/);
  assert.equal(await readFile(indexPath, "utf8"), before);
  const { stat } = await import("node:fs/promises");
  assert.equal((await stat(indexPath)).mtime.getUTCFullYear(), 2020);
});

test("frozen evaluation binds corpus and labels, and metrics penalize incomplete sets and forbidden auto reads", async () => {
  const bytes = await readFile("tests/fixtures/retrieval/corpus.json");
  const manifest = JSON.parse(await readFile("tests/fixtures/retrieval/manifest.json", "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
  const corpus = JSON.parse(bytes);
  assert.ok(corpus.queries.length >= 120);
  assert.ok(corpus.queries.filter(q => q.relevantIds.length === 0).length >= 40);
  const sample = { id: "multi", relevantIds: ["A", "B"], autoReadAllowed: true, category: "multi" };
  const match = (id, disposition = "reliable") => ({ entry: { workId: id }, disposition });
  const partial = scoreRetrieval([{ sample, matches: [match("A")] }]);
  assert.equal(partial.metrics.automaticPrecision, 1);
  assert.equal(partial.metrics.automaticRecall, 0.5);
  assert.equal(partial.metrics.multiComplete, 0);
  assert.equal(passesRetrievalGate(partial), false);
  const ambiguity = scoreRetrieval([{ sample: { ...sample, autoReadAllowed: false }, matches: [match("A", "candidate"), match("B", "candidate")] }]);
  assert.equal(ambiguity.counts.relevant, 0);
  assert.equal(ambiguity.metrics.ambiguityPreservation, 1);
  const contamination = scoreRetrieval([{ sample: { ...sample, relevantIds: ["A"] }, matches: [match("A"), match("B")] }]);
  assert.equal(contamination.metrics.automaticPrecision, 0.5);
  const unsafe = scoreRetrieval([{ sample: { ...sample, autoReadAllowed: false }, matches: [match("A")] }]);
  assert.equal(unsafe.metrics.automaticPrecision, 0);
  const duplicate = scoreRetrieval([{ sample, matches: [match("A"), match("A")] }]);
  assert.equal(duplicate.metrics.automaticRecall, 0.5);
  assert.equal(duplicate.metrics.multiComplete, 0);
  assert.equal(duplicate.metrics.automaticPrecision, 0.5);
  const duplicateCandidate = scoreRetrieval([{ sample: { ...sample, autoReadAllowed: false }, matches: [match("A", "candidate"), match("A", "candidate")] }]);
  assert.equal(duplicateCandidate.metrics.ambiguityPreservation, 0);
});
