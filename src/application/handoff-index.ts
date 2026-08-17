import { isAbsolute } from "node:path";
import type {
  HandoffIndex,
  HandoffIndexEntry,
  HandoffKind,
  HandoffRouting,
  HandoffStatus,
  LegacyHandoffIndex,
  LegacyHandoffIndexEntry,
  StoredHandoffIndex,
} from "../types.js";

const HANDOFF_KINDS = new Set<HandoffKind>([
  "feature",
  "bug",
  "investigation",
  "maintenance",
  "verification",
]);
const AVAILABLE_SECTIONS = new Set([
  "objective",
  "currentState",
  "workCompleted",
  "bugDiagnosis",
  "decisionsAndConstraints",
  "failedAttempts",
  "verification",
  "remainingWork",
  "risks",
  "evidence",
]);

export const HANDOFF_ALIAS_MIN_COUNT = 2;
export const HANDOFF_ALIAS_MAX_COUNT = 8;
export const HANDOFF_ALIAS_MAX_LENGTH = 80;
export const HANDOFF_ALIAS_FORBIDDEN_TERMS = Object.freeze([
  "功能", "模块", "代码", "问题", "处理",
  "code", "feature", "handling", "issue", "module", "problem", "process",
]);
const FORBIDDEN_ALIAS_TERMS = new Set(HANDOFF_ALIAS_FORBIDDEN_TERMS);
const CJK_ALIAS_TERM = /\p{Script=Han}/u;
const LATIN_ALIAS_TERM = /\p{Script=Latin}/u;

const HANDOFF_STATUSES = new Set<HandoffStatus>(["active", "blocked", "completed", "superseded"]);

export const EMPTY_HANDOFF_INDEX: HandoffIndex = { schemaVersion: 4, entries: [] };

export function validateHandoffIndex(value: unknown): StoredHandoffIndex {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error("Handoff index must use schemaVersion 3 or 4.");
  }
  assertOnlyKeys(value, ["schemaVersion", "entries"], "root");
  if (value.schemaVersion === 3) {
    return { schemaVersion: 3, entries: value.entries.map(normalizeLegacyEntry) };
  }
  if (value.schemaVersion === 4) {
    return { schemaVersion: 4, entries: value.entries.map(normalizeEntry) };
  }
  throw new Error("Handoff index must use schemaVersion 3 or 4.");
}

export function buildHandoffGroupKey(
  entry: Pick<HandoffIndexEntry, "workId" | "routing" | "title">,
): string {
  const specRef = firstNormalized(entry.routing.specRefs);
  if (specRef !== undefined) return `spec:${specRef}`;

  const bugId = firstNormalized(entry.routing.bugIds);
  if (bugId !== undefined) return `bug:${bugId}`;

  const file = firstNormalized(entry.routing.files);
  const symbol = firstNormalized(entry.routing.symbols);
  if (file !== undefined && symbol !== undefined) return `file-symbol:${file}:${symbol}`;
  if (symbol !== undefined) return `symbol:${symbol}`;

  const title = normalizeText(entry.title);
  return title.length >= 4 ? `title:${title}` : `entry:${entry.workId.toLocaleLowerCase()}`;
}

function normalizeEntry(value: unknown): HandoffIndexEntry {
  if (!isRecord(value)) throw new Error("Handoff index entries must be objects.");
  assertOnlyKeys(value, [
    "workId", "cycle", "title", "summary", "kind", "routing", "availableSections",
    "groupKey", "dedupeKey", "currentPath", "revision", "status", "legacyRecordIds",
    "createdAt", "updatedAt",
  ], "entry");
  const kind = requiredString(value.kind, "kind");
  if (!HANDOFF_KINDS.has(kind as HandoffKind)) {
    throw new Error(`Unsupported handoff kind: ${kind}.`);
  }
  if (!isRecord(value.routing)) throw new Error("Handoff index routing must be an object.");
  assertOnlyKeys(value.routing, ["specRefs", "bugIds", "modules", "files", "symbols", "tests", "tags", "aliases"], "routing");
  const routing = normalizeRouting(value.routing);
  const status = requiredString(value.status, "status");
  if (!HANDOFF_STATUSES.has(status as HandoffStatus)) {
    throw new Error(`Unsupported handoff status: ${status}.`);
  }
  const entry: HandoffIndexEntry = {
    workId: requiredString(value.workId, "workId"),
    cycle: requiredString(value.cycle, "cycle"),
    title: requiredString(value.title, "title"),
    summary: requiredString(value.summary, "summary"),
    kind: kind as HandoffKind,
    routing,
    availableSections: stringArray(value.availableSections, "availableSections"),
    groupKey: requiredString(value.groupKey, "groupKey"),
    dedupeKey: requiredString(value.dedupeKey, "dedupeKey"),
    currentPath: requiredString(value.currentPath, "currentPath"),
    revision: requiredPositiveInteger(value.revision, "revision"),
    status: status as HandoffStatus,
    legacyRecordIds: stringArray(value.legacyRecordIds, "legacyRecordIds"),
    createdAt: requiredString(value.createdAt, "createdAt"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
  };
  if (!/^W[0-9]+$/u.test(entry.workId)) throw new Error("Handoff index workId must use the W<number> form.");
  if (!/^sha256:[a-f0-9]{64}$/u.test(entry.dedupeKey)) {
    throw new Error("Handoff index dedupeKey must be a SHA-256 key.");
  }
  if (entry.availableSections.some((section) => !AVAILABLE_SECTIONS.has(section))) {
    throw new Error("Handoff index availableSections contains an unsupported section.");
  }
  if (Number.isNaN(Date.parse(entry.createdAt)) || Number.isNaN(Date.parse(entry.updatedAt))) {
    throw new Error("Handoff index timestamps must be date-times.");
  }
  if (entry.updatedAt < entry.createdAt) throw new Error("Handoff index updatedAt must not precede createdAt.");
  for (const path of [entry.currentPath, ...entry.routing.files]) {
    const normalized = path.replaceAll("\\", "/");
    if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
      throw new Error("Handoff index paths must be project-relative.");
    }
  }
  return entry;
}

function normalizeLegacyEntry(value: unknown): LegacyHandoffIndexEntry {
  if (!isRecord(value)) throw new Error("Handoff index entries must be objects.");
  assertOnlyKeys(value, [
    "id", "cycle", "title", "summary", "kind", "routing", "availableSections",
    "groupKey", "dedupeKey", "path", "createdAt",
  ], "entry");
  const kind = requiredString(value.kind, "kind");
  if (!HANDOFF_KINDS.has(kind as HandoffKind)) throw new Error(`Unsupported handoff kind: ${kind}.`);
  if (!isRecord(value.routing)) throw new Error("Handoff index routing must be an object.");
  assertOnlyKeys(value.routing, ["specRefs", "bugIds", "modules", "files", "symbols", "tests", "tags", "aliases"], "routing");
  const entry: LegacyHandoffIndexEntry = {
    id: requiredString(value.id, "id"),
    cycle: requiredString(value.cycle, "cycle"),
    title: requiredString(value.title, "title"),
    summary: requiredString(value.summary, "summary"),
    kind: kind as HandoffKind,
    routing: normalizeRouting(value.routing),
    availableSections: stringArray(value.availableSections, "availableSections"),
    groupKey: requiredString(value.groupKey, "groupKey"),
    dedupeKey: requiredString(value.dedupeKey, "dedupeKey"),
    path: requiredString(value.path, "path"),
    createdAt: requiredString(value.createdAt, "createdAt"),
  };
  if (!/^W[0-9]+$/u.test(entry.id)) throw new Error("Handoff index id must use the W<number> form.");
  if (!/^sha256:[a-f0-9]{64}$/u.test(entry.dedupeKey)) throw new Error("Handoff index dedupeKey must be a SHA-256 key.");
  if (entry.availableSections.some((section) => !AVAILABLE_SECTIONS.has(section))) {
    throw new Error("Handoff index availableSections contains an unsupported section.");
  }
  if (Number.isNaN(Date.parse(entry.createdAt))) throw new Error("Handoff index createdAt must be a date-time.");
  for (const path of [entry.path, ...entry.routing.files]) validateRelativePath(path);
  return entry;
}

function normalizeRouting(value: Record<string, unknown>): HandoffRouting {
  return {
    specRefs: stringArray(value.specRefs, "routing.specRefs"),
    bugIds: stringArray(value.bugIds, "routing.bugIds"),
    modules: stringArray(value.modules, "routing.modules"),
    files: stringArray(value.files, "routing.files").map((path) => path.replaceAll("\\", "/")),
    symbols: stringArray(value.symbols, "routing.symbols"),
    tests: stringArray(value.tests, "routing.tests"),
    tags: stringArray(value.tags, "routing.tags"),
    aliases: normalizeHandoffAliases(value.aliases, "routing.aliases"),
  };
}

export function normalizeHandoffAliases(value: unknown, field = "aliases"): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Handoff ${field} must be a string array.`);
  }
  const unique = new Map<string, string>();
  for (const raw of value as string[]) {
    const alias = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (alias.length === 0) continue;
    if (alias.length > HANDOFF_ALIAS_MAX_LENGTH) {
      throw new Error(`Handoff ${field} entries must not exceed ${HANDOFF_ALIAS_MAX_LENGTH} characters.`);
    }
    if (isBroadAlias(alias)) {
      throw new Error(`Handoff ${field} must not contain only broad retrieval terms.`);
    }
    const key = alias.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, alias);
  }
  const aliases = [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, alias]) => alias);
  if (aliases.length === 0) return [];
  if (aliases.length < HANDOFF_ALIAS_MIN_COUNT || aliases.length > HANDOFF_ALIAS_MAX_COUNT) {
    throw new Error(
      `Handoff ${field} must contain ${HANDOFF_ALIAS_MIN_COUNT}-${HANDOFF_ALIAS_MAX_COUNT} unique aliases when provided.`,
    );
  }
  if (!aliases.some((alias) => CJK_ALIAS_TERM.test(alias)) || !aliases.some((alias) => LATIN_ALIAS_TERM.test(alias))) {
    throw new Error(`Handoff ${field} must include both Chinese and English retrieval phrases.`);
  }
  return aliases;
}

function isBroadAlias(alias: string): boolean {
  const normalized = alias.toLocaleLowerCase();
  if (FORBIDDEN_ALIAS_TERMS.has(normalized)) return true;
  let remainder = normalized;
  for (const term of HANDOFF_ALIAS_FORBIDDEN_TERMS.filter((value) => CJK_ALIAS_TERM.test(value))) {
    remainder = remainder.replaceAll(term, " ");
  }
  const meaningfulCjk = (remainder.match(/\p{Script=Han}/gu) ?? []).length >= 2;
  const latinTerms = normalized.match(/[\p{Script=Latin}\p{N}]+/gu) ?? [];
  const meaningfulLatin = latinTerms.some((term) => !FORBIDDEN_ALIAS_TERMS.has(term));
  return !meaningfulCjk && !meaningfulLatin;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Handoff index ${field} must be a string array.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Handoff index ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Handoff index ${field} must be a positive integer.`);
  }
  return value as number;
}

function validateRelativePath(path: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Handoff index paths must be project-relative.");
  }
}

function firstNormalized(values: string[]): string | undefined {
  const first = values.map(normalizeText).find(Boolean);
  return first === "" ? undefined : first;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll("\\", "/").replace(/\s+/gu, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], field: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) throw new Error(`Unsupported handoff index ${field} field: ${unknown}.`);
}
