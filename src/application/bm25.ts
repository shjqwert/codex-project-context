import type { HandoffIndexEntry } from "../types.js";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export const BM25_FIELD_WEIGHTS = Object.freeze({
  title: 3,
  modules: 2,
  tags: 2,
  tests: 2,
  aliases: 2,
  summary: 1,
});
export const BM25_MIN_QUERY_TERMS = 2;
export const BM25_MIN_MATCHED_TERMS = 2;
// Calibrated by the ambiguity, broad-term, Chinese, and 10/100/1000-entry tests:
// require multiple terms and 50% coverage, reject corpus-wide noise with a raw floor,
// require stable normalized quality, and keep leaders within 12% instead of forcing one.
export const BM25_MIN_TERM_COVERAGE = 0.5;
export const BM25_MIN_RAW_SCORE = 0.25;
export const BM25_MIN_NORMALIZED_SCORE = 0.25;
export const BM25_CLOSE_SCORE_RATIO = 0.12;
export const BM25_SECONDARY_SCORE_RATIO = 0.7;
export const CJK_NGRAM_MIN = 2;
export const CJK_NGRAM_MAX = 3;
export const MIN_LEXICAL_TOKEN_LENGTH = 2;

const ENGLISH_STOP_WORDS = new Set([
  "a", "again", "an", "and", "are", "as", "at", "be", "by", "check", "code",
  "continue", "create", "current", "evidence", "explain", "for", "from", "handoff",
  "in", "inspect", "is", "it", "last", "of", "on", "or", "please", "previous",
  "project", "record", "related", "return", "review", "state", "task", "test", "tests",
  "testing", "the", "this", "to", "update", "verification", "verify", "with", "work", "write",
]);
const CJK_STOP_WORDS = [
  "继续", "之前", "上次", "工作", "任务", "检查", "验证", "验收", "测试", "记录", "项目", "相关", "这个", "那个",
];
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

interface WeightedDocument {
  entry: HandoffIndexEntry;
  frequencies: Map<string, number>;
  length: number;
}

export interface Bm25Hit {
  entry: HandoffIndexEntry;
  rawScore: number;
  normalizedScore: number;
  matchedTerms: string[];
  termCoverage: number;
}

export interface Bm25Ranking {
  queryTerms: string[];
  hits: Bm25Hit[];
}

export function searchHandoffsBm25(entries: HandoffIndexEntry[], query: string): Bm25Hit[] {
  const ranking = rankHandoffsBm25(entries, query);
  if (ranking.queryTerms.length < BM25_MIN_QUERY_TERMS) return [];

  const bestByGroup = new Map<string, Bm25Hit>();
  for (const hit of ranking.hits) {
    if (!isReliableHit(hit)) continue;
    const current = bestByGroup.get(hit.entry.groupKey);
    if (current === undefined || compareHits(hit, current) < 0) {
      bestByGroup.set(hit.entry.groupKey, hit);
    }
  }
  const reliable = [...bestByGroup.values()].sort(compareHits);
  const first = reliable[0];
  if (first === undefined) return [];
  const second = reliable[1];
  if (second !== undefined && relativeGap(first.rawScore, second.rawScore) < BM25_CLOSE_SCORE_RATIO) {
    return reliable.filter((hit) =>
      relativeGap(first.rawScore, hit.rawScore) < BM25_CLOSE_SCORE_RATIO
    );
  }
  return reliable.filter((hit) =>
    hit.rawScore >= first.rawScore * BM25_SECONDARY_SCORE_RATIO
  );
}

export function rankHandoffsBm25(entries: HandoffIndexEntry[], query: string): Bm25Ranking {
  const tokenizedQuery = [...new Set(tokenizeBm25(query))];
  if (entries.length === 0 || tokenizedQuery.length === 0) return { queryTerms: [], hits: [] };
  const documents = entries.map(buildDocument);
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const documentFrequencies = buildDocumentFrequencies(documents);
  const queryTerms = tokenizedQuery.filter((term) => documentFrequencies.has(term));
  if (queryTerms.length === 0) return { queryTerms, hits: [] };
  const hits = documents.flatMap((document): Bm25Hit[] => {
    let rawScore = 0;
    let maximumMatchedScore = 0;
    const matchedTerms: string[] = [];
    for (const term of queryTerms) {
      const frequency = document.frequencies.get(term) ?? 0;
      if (frequency === 0) continue;
      const inverseDocumentFrequency = idf(entries.length, documentFrequencies.get(term) ?? 0);
      const lengthNormalization = BM25_K1 * (
        1 - BM25_B + BM25_B * (document.length / averageLength)
      );
      rawScore += inverseDocumentFrequency * (
        frequency * (BM25_K1 + 1) / (frequency + lengthNormalization)
      );
      maximumMatchedScore += inverseDocumentFrequency * (BM25_K1 + 1);
      matchedTerms.push(term);
    }
    if (matchedTerms.length === 0) return [];
    return [{
      entry: document.entry,
      rawScore,
      normalizedScore: maximumMatchedScore === 0 ? 0 : rawScore / maximumMatchedScore,
      matchedTerms,
      termCoverage: matchedTerms.length / queryTerms.length,
    }];
  }).sort(compareHits);
  return { queryTerms, hits };
}

export function tokenizeBm25(value: string): string[] {
  let normalized = value.normalize("NFKC").replaceAll("\\", "/");
  normalized = normalized
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .toLocaleLowerCase();
  for (const stopWord of CJK_STOP_WORDS) normalized = normalized.replaceAll(stopWord, " ");

  const tokens: string[] = [];
  const withoutCjk = normalized.replace(CJK_RUN, " ");
  for (const token of withoutCjk.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (token.length >= MIN_LEXICAL_TOKEN_LENGTH && !ENGLISH_STOP_WORDS.has(token)) tokens.push(token);
  }
  for (const run of normalized.match(CJK_RUN) ?? []) {
    for (let size = CJK_NGRAM_MIN; size <= Math.min(CJK_NGRAM_MAX, run.length); size += 1) {
      for (let offset = 0; offset <= run.length - size; offset += 1) {
        tokens.push(run.slice(offset, offset + size));
      }
    }
  }
  return tokens;
}

function buildDocument(entry: HandoffIndexEntry): WeightedDocument {
  const frequencies = new Map<string, number>();
  let length = 0;
  const add = (values: string[], weight: number): void => {
    for (const value of values) {
      for (const token of tokenizeBm25(value)) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + weight);
        length += weight;
      }
    }
  };
  add([entry.title], BM25_FIELD_WEIGHTS.title);
  add(entry.routing.modules, BM25_FIELD_WEIGHTS.modules);
  add(entry.routing.tags, BM25_FIELD_WEIGHTS.tags);
  add(entry.routing.tests, BM25_FIELD_WEIGHTS.tests);
  add(entry.routing.aliases ?? [], BM25_FIELD_WEIGHTS.aliases);
  add([entry.summary], BM25_FIELD_WEIGHTS.summary);
  return { entry, frequencies, length };
}

function buildDocumentFrequencies(documents: WeightedDocument[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.frequencies.keys()) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
  }
  return frequencies;
}

function isReliableHit(hit: Bm25Hit): boolean {
  return hit.matchedTerms.length >= BM25_MIN_MATCHED_TERMS &&
    hit.termCoverage >= BM25_MIN_TERM_COVERAGE &&
    hit.rawScore >= BM25_MIN_RAW_SCORE &&
    hit.normalizedScore >= BM25_MIN_NORMALIZED_SCORE;
}

function idf(documentCount: number, documentFrequency: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function compareHits(left: Bm25Hit, right: Bm25Hit): number {
  return right.rawScore - left.rawScore ||
    right.normalizedScore - left.normalizedScore ||
    right.termCoverage - left.termCoverage ||
    right.entry.createdAt.localeCompare(left.entry.createdAt) ||
    right.entry.id.localeCompare(left.entry.id);
}

function relativeGap(first: number, second: number): number {
  return first <= 0 ? 0 : (first - second) / first;
}
