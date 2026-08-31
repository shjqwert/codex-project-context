import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function scoreRetrieval(cases) {
  let correct = 0, returned = 0, relevant = 0, topCorrect = 0, topTotal = 0;
  let multiCorrect = 0, multiTotal = 0, negativeFalse = 0, negativeAny = 0, negatives = 0;
  let ambiguityCorrect = 0, ambiguities = 0;
  const failures = [];
  for (const { sample, matches } of cases) {
    const auto = matches.filter(m => m.disposition !== "candidate").map(m => m.entry.workId);
    const candidate = matches.filter(m => m.disposition === "candidate").map(m => m.entry.workId);
    const automaticIds = new Set(auto);
    const candidateIds = new Set(candidate);
    const expected = new Set(sample.relevantIds);
    const hits = sample.autoReadAllowed ? [...automaticIds].filter(id => expected.has(id)).length : 0;
    returned += auto.length;
    correct += hits;
    if (sample.autoReadAllowed) relevant += expected.size;
    let ok;
    if (!expected.size) {
      negatives++; negativeFalse += Number(auto.length > 0); negativeAny += Number(matches.length > 0);
      ok = matches.length === 0;
    } else if (!sample.autoReadAllowed) {
      ambiguities++;
      ok = auto.length === 0 && candidate.length === candidateIds.size && candidateIds.size === expected.size && [...candidateIds].every(id => expected.has(id));
      ambiguityCorrect += Number(ok);
    } else {
      ok = auto.length === automaticIds.size && automaticIds.size === expected.size && hits === expected.size;
      if (expected.size === 1) { topTotal++; topCorrect += Number(expected.has(auto[0])); }
      else { multiTotal++; multiCorrect += Number(ok); }
    }
    if (!ok) failures.push({ id: sample.id, category: sample.category, expected: [...expected], automatic: auto, candidates: candidate });
  }
  const ratio = (a, b) => b ? a / b : null;
  return {
    metrics: {
      automaticPrecision: ratio(correct, returned), automaticRecall: ratio(correct, relevant),
      top1: ratio(topCorrect, topTotal), multiComplete: ratio(multiCorrect, multiTotal),
      negativeFalsePositiveRate: ratio(negativeFalse, negatives), negativeAnyResultRate: ratio(negativeAny, negatives),
      ambiguityPreservation: ratio(ambiguityCorrect, ambiguities),
    },
    counts: { queries: cases.length, correct, returned, relevant, topTotal, multiTotal, negatives, ambiguities },
    failures,
  };
}

export function passesRetrievalGate(report) {
  const m = report.metrics;
  return m.automaticPrecision >= 0.95 && m.automaticRecall >= 0.85 && m.top1 >= 0.90
    && m.multiComplete === 1 && m.negativeFalsePositiveRate <= 0.05 && m.negativeAnyResultRate <= 0.05
    && m.ambiguityPreservation === 1
    && !report.failures.some(f => ["id", "path", "symbol", "exclusion", "multi", "multi-natural"].includes(f.category));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const split = process.argv.includes("--holdout") ? "holdout" : "development";
  const directory = new URL("../tests/fixtures/retrieval/", import.meta.url);
  const bytes = await readFile(new URL("corpus.json", directory));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
  if (hash !== manifest.sha256) throw new Error("Frozen retrieval corpus/labels changed; do not tune the acceptance set.");
  const corpus = JSON.parse(bytes);
  const { matchHandoffEntries } = await import("../dist/application/handoffs.js");
  const cases = corpus.queries.filter(q => q.split === split)
    .map(sample => ({ sample, matches: matchHandoffEntries(corpus.entries, sample.query) }));
  const scored = scoreRetrieval(cases);
  const report = { fixtureSha256: hash, split, ...scored, passed: passesRetrievalGate(scored) };
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  const { failures, ...summary } = report;
  console.log(JSON.stringify({ ...summary, failureCount: failures.length, ...(split === "development" ? { failures } : {}) }, null, 2));
  if (!report.passed && !process.argv.includes("--baseline")) process.exitCode = 1;
}
