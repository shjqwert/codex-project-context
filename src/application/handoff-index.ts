import type {
  HandoffIndex,
  HandoffIndexEntry,
  HandoffSectionSummary,
} from "../types.js";

export const EMPTY_HANDOFF_INDEX: HandoffIndex = { schemaVersion: 2, entries: [] };

export function normalizeHandoffIndex(value: unknown): {
  index: HandoffIndex;
  migrated: boolean;
} {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error("Unsupported or invalid handoff index.");
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error("Unsupported or invalid handoff index.");
  }

  const entries = value.entries.map((entry) => normalizeEntry(entry));
  const migrated =
    value.schemaVersion !== 2 ||
    value.entries.some(
      (entry) =>
        !isRecord(entry) ||
        !Array.isArray(entry.sectionSummaries) ||
        typeof entry.groupKey !== "string",
    );

  return { index: { schemaVersion: 2, entries }, migrated };
}

export function buildHandoffGroupKey(
  entry: Pick<HandoffIndexEntry, "id" | "specRefs" | "bugIds" | "files" | "symbols" | "title">,
): string {
  const specRef = firstNormalized(entry.specRefs);
  if (specRef !== undefined) return `spec:${specRef}`;

  const bugId = firstNormalized(entry.bugIds);
  if (bugId !== undefined) return `bug:${bugId}`;

  const file = firstNormalized(entry.files);
  const symbol = firstNormalized(entry.symbols);
  if (file !== undefined && symbol !== undefined) return `file-symbol:${file}:${symbol}`;
  if (symbol !== undefined) return `symbol:${symbol}`;

  const title = normalizeText(entry.title);
  return title.length >= 4 ? `title:${title}` : `entry:${entry.id.toLocaleLowerCase()}`;
}

function normalizeEntry(value: unknown): HandoffIndexEntry {
  if (!isRecord(value)) throw new Error("Handoff index entries must be objects.");

  const entry: HandoffIndexEntry = {
    id: requiredString(value.id, "id"),
    cycle: requiredString(value.cycle, "cycle"),
    title: requiredString(value.title, "title"),
    summary: requiredString(value.summary, "summary"),
    specRefs: stringArray(value.specRefs, "specRefs"),
    bugIds: stringArray(value.bugIds, "bugIds"),
    modules: stringArray(value.modules, "modules"),
    files: stringArray(value.files, "files"),
    symbols: stringArray(value.symbols, "symbols"),
    testNames: stringArray(value.testNames, "testNames"),
    tags: stringArray(value.tags, "tags"),
    sections: stringArray(value.sections, "sections"),
    sectionSummaries: sectionSummaryArray(value.sectionSummaries),
    groupKey: "",
    path: requiredString(value.path, "path"),
    createdAt: requiredString(value.createdAt, "createdAt"),
  };
  if (typeof value.dedupeKey === "string" && value.dedupeKey.trim().length > 0) {
    entry.dedupeKey = value.dedupeKey.trim();
  }
  entry.groupKey =
    typeof value.groupKey === "string" && value.groupKey.trim().length > 0
      ? value.groupKey.trim()
      : buildHandoffGroupKey(entry);
  return entry;
}

function sectionSummaryArray(value: unknown): HandoffSectionSummary[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Handoff sectionSummaries must be an array.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Handoff section summaries must be objects.");
    return {
      name: requiredString(item.name, "section summary name"),
      summary: requiredString(item.summary, "section summary text"),
    };
  });
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Handoff index ${field} must be a string array.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
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
  return value.trim().toLocaleLowerCase().replaceAll("\\", "/").replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
