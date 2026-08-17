import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  BM25_FIELD_WEIGHTS,
  BM25_MIN_MATCHED_TERMS,
  BM25_MIN_QUERY_TERMS,
  CJK_NGRAM_MAX,
  CJK_NGRAM_MIN,
  rankHandoffsBm25,
  searchHandoffsBm25,
  tokenizeBm25,
} from "../dist/application/bm25.js";
import { matchHandoffEntries } from "../dist/application/handoffs.js";

test("BM25 tokenization normalizes identifiers, Unicode, paths, and CJK n-grams", () => {
  const tokens = tokenizeBm25("ＡppPowerMode\\驱动初始化");
  assert.ok(tokens.includes("app"));
  assert.ok(tokens.includes("power"));
  assert.ok(tokens.includes("mode"));
  assert.ok(tokens.includes("驱动"));
  assert.ok(tokens.includes("初始化"));
  assert.deepEqual([CJK_NGRAM_MIN, CJK_NGRAM_MAX], [2, 3]);
  assert.equal(BM25_MIN_QUERY_TERMS, 2);
  assert.equal(BM25_MIN_MATCHED_TERMS, 2);
});

test("BM25 field weights favor titles and rare terms over broad summary terms", () => {
  const titleHit = entry("W001", {
    title: "Graceful socket shutdown",
    summary: "Lifecycle note.",
  });
  const summaryHit = entry("W002", {
    title: "Lifecycle note",
    summary: "Graceful socket shutdown.",
  });
  const commonHit = entry("W003", {
    title: "Router recovery baseline",
    summary: "Router recovery state is confirmed.",
  });
  const rareHit = entry("W004", {
    title: "Router recovery quasar",
    summary: "Router recovery state is confirmed with quasar telemetry.",
  });

  const weighted = rankHandoffsBm25([titleHit, summaryHit], "graceful socket shutdown");
  assert.equal(weighted.hits[0]?.entry.workId, "W001");
  assert.ok((weighted.hits[0]?.rawScore ?? 0) > (weighted.hits[1]?.rawScore ?? 0));
  assert.deepEqual(BM25_FIELD_WEIGHTS, { title: 3, modules: 2, tags: 2, tests: 2, aliases: 2, summary: 1 });

  const rare = rankHandoffsBm25([commonHit, rareHit], "router recovery quasar");
  assert.equal(rare.hits[0]?.entry.workId, "W004");
  assert.ok((rare.hits[0]?.rawScore ?? 0) > (rare.hits[1]?.rawScore ?? 0));
});

test("BM25 requires multiple useful terms and keeps close leaders together", () => {
  const first = entry("W001", { title: "Motor thermal recovery" });
  const second = entry("W002", { title: "Motor thermal recovery" });
  assert.deepEqual(searchHandoffsBm25([first, second], "state"), []);

  const tied = searchHandoffsBm25([first, second], "motor thermal recovery");
  assert.deepEqual(tied.map(({ entry: value }) => value.workId).sort(), ["W001", "W002"]);
});

test("BM25 retrieves Chinese multi-keyword descriptions", () => {
  const motor = entry("W001", {
    title: "电机过流保护诊断",
    summary: "电流采样超过阈值后关闭 PWM 输出。",
    modules: ["电机控制"],
    tags: ["过流保护"],
  });
  const can = entry("W002", {
    title: "通信总线恢复",
    summary: "CAN 报文超时后重新初始化控制器。",
    modules: ["通信"],
  });
  const hits = searchHandoffsBm25([motor, can], "电机电流过流关闭");
  assert.equal(hits[0]?.entry.workId, "W001");
  assert.ok((hits[0]?.matchedTerms.length ?? 0) >= 2);
});

test("BM25 aliases bridge Chinese and English without changing deterministic routing", () => {
  const motor = entry("W001", {
    title: "Motor overcurrent restart",
    summary: "PWM remains disabled until sampled current is safe.",
    files: ["src/motor.ts"],
    symbols: ["restartMotor"],
    aliases: ["电机过流安全重启", "电流恢复后重新启动", "motor safety restart", "restart after current recovery"],
  });
  const can = entry("W002", {
    title: "CAN timeout recovery",
    summary: "The controller recovers after a receive timeout.",
    aliases: ["通信超时恢复控制器", "总线接收超时重启", "communication timeout recovery", "bus receive timeout restart"],
  });

  assert.equal(searchHandoffsBm25([motor, can], "电机过流安全重启")?.[0]?.entry.workId, "W001");
  assert.equal(searchHandoffsBm25([motor, can], "motor safety restart")?.[0]?.entry.workId, "W001");
  assert.equal(matchHandoffEntries([motor, can], "Inspect src/motor.ts")?.[0]?.score, 90);
  assert.equal(matchHandoffEntries([motor, can], "Inspect restartMotor")?.[0]?.score, 80);
  assert.deepEqual(searchHandoffsBm25([motor, can], "处理"), []);
  assert.deepEqual(searchHandoffsBm25([motor, can], "周末餐厅推荐"), []);
});

test("BM25 indexes module descriptions, tags, and test names", () => {
  const routed = entry("W001", {
    title: "Power supervision",
    summary: "Confirmed behavior.",
    modules: ["MotorControlSupervisor"],
    tags: ["brownout-recovery"],
    tests: ["cold restart matrix"],
  });
  const unrelated = entry("W002", {
    title: "Communication supervision",
    summary: "Confirmed bus behavior.",
  });
  assert.equal(searchHandoffsBm25([routed, unrelated], "motor control supervisor")?.[0]?.entry.workId, "W001");
  assert.equal(searchHandoffsBm25([routed, unrelated], "brownout recovery")?.[0]?.entry.workId, "W001");
  assert.equal(searchHandoffsBm25([routed, unrelated], "cold restart matrix")?.[0]?.entry.workId, "W001");
});

test("BM25 failures fall back to deterministic routing", () => {
  const deterministic = entry("W001", { symbols: ["stopSession"] });
  const failedSearch = () => {
    throw new Error("synthetic BM25 failure");
  };
  const exact = matchHandoffEntries([deterministic], "Inspect stopSession", failedSearch);
  assert.equal(exact[0]?.entry.workId, "W001");
  assert.equal(exact[0]?.score, 80);
  assert.deepEqual(matchHandoffEntries([deterministic], "graceful socket shutdown", failedSearch), []);
});

test("BM25 query cost remains bounded for 10, 100, and 1000 lightweight entries", () => {
  for (const size of [10, 100, 1_000]) {
    const entries = Array.from({ length: size }, (_, index) => entry(`W${String(index + 1).padStart(3, "0")}`, {
      title: `Motor controller recovery channel ${index}`,
      summary: `Channel ${index} preserves thermal shutdown diagnostics and restart evidence.`,
      modules: [`motor-${index % 20}`],
      tags: [index % 2 === 0 ? "thermal" : "diagnostic"],
      tests: [`recovery-${index % 50}`],
      aliases: [`通道${index}热恢复`, `thermal recovery channel ${index}`],
    }));
    const started = performance.now();
    rankHandoffsBm25(entries, "motor thermal shutdown recovery");
    assert.ok(performance.now() - started < 5_000, `BM25 exceeded the Hook timeout at ${size} entries`);
  }
});

function entry(id, overrides = {}) {
  return {
    workId: id,
    cycle: "development",
    title: overrides.title ?? `Record ${id}`,
    summary: overrides.summary ?? "Confirmed state.",
    kind: "investigation",
    routing: {
      specRefs: overrides.specRefs ?? [],
      bugIds: overrides.bugIds ?? [],
      modules: overrides.modules ?? [],
      files: overrides.files ?? [],
      symbols: overrides.symbols ?? [],
      tests: overrides.tests ?? [],
      tags: overrides.tags ?? [],
      aliases: overrides.aliases ?? [],
    },
    availableSections: ["objective", "currentState", "remainingWork"],
    groupKey: overrides.groupKey ?? `title:${id.toLowerCase()}`,
    dedupeKey: `sha256:${id.padEnd(64, "0").slice(0, 64).toLowerCase()}`,
    currentPath: `.agent/handoff/current/development/${id}.md`,
    revision: 1,
    status: "active",
    legacyRecordIds: [],
    createdAt: overrides.createdAt ?? `2026-01-01T00:00:${id.slice(1).padStart(2, "0")}.000Z`,
    updatedAt: overrides.createdAt ?? `2026-01-01T00:00:${id.slice(1).padStart(2, "0")}.000Z`,
  };
}
