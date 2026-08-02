import { isAbsolute } from "node:path";
import type {
  HandoffIndex,
  HandoffIndexEntry,
  HandoffKind,
  HandoffRouting,
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

export const EMPTY_HANDOFF_INDEX: HandoffIndex = { schemaVersion: 3, entries: [] };

export function validateHandoffIndex(value: unknown): HandoffIndex {
  if (!isRecord(value) || value.schemaVersion !== 3 || !Array.isArray(value.entries)) {
    throw new Error("Handoff index must use schemaVersion 3.");
  }
  assertOnlyKeys(value, ["schemaVersion", "entries"], "root");
  return { schemaVersion: 3, entries: value.entries.map(normalizeEntry) };
}

export function buildHandoffGroupKey(
  entry: Pick<HandoffIndexEntry, "id" | "routing" | "title">,
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
  return title.length >= 4 ? `title:${title}` : `entry:${entry.id.toLocaleLowerCase()}`;
}

function normalizeEntry(value: unknown): HandoffIndexEntry {
  if (!isRecord(value)) throw new Error("Handoff index entries must be objects.");
  assertOnlyKeys(value, [
    "id", "cycle", "title", "summary", "kind", "routing", "availableSections",
    "groupKey", "dedupeKey", "path", "createdAt",
  ], "entry");
  const kind = requiredString(value.kind, "kind");
  if (!HANDOFF_KINDS.has(kind as HandoffKind)) {
    throw new Error(`Unsupported handoff kind: ${kind}.`);
  }
  if (!isRecord(value.routing)) throw new Error("Handoff index routing must be an object.");
  assertOnlyKeys(value.routing, ["specRefs", "bugIds", "modules", "files", "symbols", "tests", "tags"], "routing");
  const routing = normalizeRouting(value.routing);
  const entry: HandoffIndexEntry = {
    id: requiredString(value.id, "id"),
    cycle: requiredString(value.cycle, "cycle"),
    title: requiredString(value.title, "title"),
    summary: requiredString(value.summary, "summary"),
    kind: kind as HandoffKind,
    routing,
    availableSections: stringArray(value.availableSections, "availableSections"),
    groupKey: requiredString(value.groupKey, "groupKey"),
    dedupeKey: requiredString(value.dedupeKey, "dedupeKey"),
    path: requiredString(value.path, "path"),
    createdAt: requiredString(value.createdAt, "createdAt"),
  };
  if (!/^W[0-9]+$/u.test(entry.id)) throw new Error("Handoff index id must use the W<number> form.");
  if (!/^sha256:[a-f0-9]{64}$/u.test(entry.dedupeKey)) {
    throw new Error("Handoff index dedupeKey must be a SHA-256 key.");
  }
  if (entry.availableSections.some((section) => !AVAILABLE_SECTIONS.has(section))) {
    throw new Error("Handoff index availableSections contains an unsupported section.");
  }
  if (Number.isNaN(Date.parse(entry.createdAt))) throw new Error("Handoff index createdAt must be a date-time.");
  for (const path of [entry.path, ...entry.routing.files]) {
    const normalized = path.replaceAll("\\", "/");
    if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
      throw new Error("Handoff index paths must be project-relative.");
    }
  }
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
  };
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
