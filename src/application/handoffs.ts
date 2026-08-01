import { dirname, resolve } from "node:path";
import type {
  HandoffIndexEntry,
  HandoffInput,
  HandoffMatch,
  HandoffSections,
  HandoffSectionSummary,
} from "../types.js";
import { ensureDirectory, readJson, writeJsonAtomic, writeTextAtomic } from "../infrastructure/files.js";
import { buildHandoffGroupKey, normalizeHandoffIndex } from "./handoff-index.js";
import { readProjectContext, requireProjectRoot } from "./project-context.js";

const SECTION_LABELS: Array<[keyof HandoffSections, string]> = [
  ["objective", "Window Objective"],
  ["startingState", "Starting State"],
  ["workCompleted", "Work Completed"],
  ["bugDiagnosis", "Bug Diagnosis"],
  ["behavioralConstraints", "Behavioral Constraints"],
  ["changedAreas", "Changed Areas"],
  ["verification", "Verification"],
  ["risks", "Unresolved Facts and Risks"],
  ["evidence", "Evidence"],
];

const MATCH_THRESHOLD = 40;

export async function createHandoff(
  projectDirectory: string,
  rawInput: HandoffInput,
): Promise<{ ok: true; id: string; path: string; projectRoot: string }> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const indexPath = resolve(projectRoot, context.handoffIndex);
  const { index } = normalizeHandoffIndex(await readJson<unknown>(indexPath));

  const input = normalizeInput(rawInput);
  const id = nextHandoffId(index.entries);
  const cycle = sanitizeSegment(input.cycle ?? context.currentCycle, "development");
  const relativePath = `.agent/handoff/cycles/${cycle}/${id}-${slugify(input.title)}.md`;
  const absolutePath = resolve(projectRoot, relativePath);
  const createdAt = new Date().toISOString();
  const entry = buildIndexEntry(id, cycle, relativePath, createdAt, input);

  await ensureDirectory(dirname(absolutePath));
  await writeTextAtomic(absolutePath, renderHandoff(entry, input));
  index.entries.push(entry);
  await writeJsonAtomic(indexPath, index);

  return { ok: true, id, path: absolutePath, projectRoot };
}

export async function matchHandoffs(
  projectDirectory: string,
  prompt: string,
  limit = 5,
): Promise<HandoffMatch[]> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const { index } = normalizeHandoffIndex(
    await readJson<unknown>(resolve(projectRoot, context.handoffIndex)),
  );

  const normalizedPrompt = normalizeSearchText(prompt);
  const scored = index.entries
    .map((entry) => scoreEntry(entry, normalizedPrompt))
    .filter((result): result is HandoffMatch => result !== undefined && result.score >= MATCH_THRESHOLD);

  return aggregateMatches(scored, index.entries)
    .sort(compareMatches)
    .slice(0, Math.max(0, limit));
}

function normalizeInput(input: HandoffInput): HandoffInput & Required<Pick<HandoffInput, "title" | "summary">> {
  const title = requiredText(input.title, "title");
  const summary = requiredText(input.summary, "summary");
  return {
    ...input,
    title,
    summary,
    kind: uniqueStrings(input.kind),
    specRefs: uniqueStrings(input.specRefs),
    modules: uniqueStrings(input.modules),
    symbols: uniqueStrings(input.symbols),
    files: uniqueStrings(input.files).map((file) => file.replaceAll("\\", "/")),
    bugIds: uniqueStrings(input.bugIds),
    tests: uniqueStrings(input.tests),
    tags: uniqueStrings(input.tags),
  };
}

function buildIndexEntry(
  id: string,
  cycle: string,
  path: string,
  createdAt: string,
  input: HandoffInput,
): HandoffIndexEntry {
  const sectionSummaries = SECTION_LABELS.flatMap(([key, label]) => {
    const content = input.sections?.[key]?.trim();
    return content === undefined || content.length === 0
      ? []
      : [{ name: label, summary: summarizeSection(content) }];
  });
  const entry: HandoffIndexEntry = {
    id,
    cycle,
    title: input.title,
    summary: input.summary,
    specRefs: input.specRefs ?? [],
    bugIds: input.bugIds ?? [],
    modules: input.modules ?? [],
    files: input.files ?? [],
    symbols: input.symbols ?? [],
    testNames: input.tests ?? [],
    tags: input.tags ?? [],
    sections: sectionSummaries.map(({ name }) => name),
    sectionSummaries,
    groupKey: "",
    path,
    createdAt,
  };
  entry.groupKey = buildHandoffGroupKey(entry);
  return entry;
}

function renderHandoff(entry: HandoffIndexEntry, input: HandoffInput): string {
  const frontmatter = [
    "---",
    `id: ${entry.id}`,
    `cycle: ${entry.cycle}`,
    `date: ${entry.createdAt.slice(0, 10)}`,
    `kind: ${JSON.stringify(input.kind ?? [])}`,
    `spec_refs: ${JSON.stringify(entry.specRefs)}`,
    `modules: ${JSON.stringify(entry.modules)}`,
    `symbols: ${JSON.stringify(entry.symbols)}`,
    `files: ${JSON.stringify(entry.files)}`,
    `bug_ids: ${JSON.stringify(entry.bugIds)}`,
    "---",
  ];

  const sections = SECTION_LABELS.map(([key, label]) => {
    const fallback = key === "bugDiagnosis" ? "根因未确认。" : "未记录。";
    return `## ${label}\n\n${input.sections?.[key]?.trim() || fallback}`;
  });

  return `${frontmatter.join("\n")}\n\n# ${entry.id} ${input.title}\n\n> ${input.summary}\n\n${sections.join("\n\n")}\n`;
}

function scoreEntry(entry: HandoffIndexEntry, prompt: string): HandoffMatch | undefined {
  let score = 0;
  const reasons: string[] = [];
  const add = (weight: number, reason: string): void => {
    score += weight;
    reasons.push(reason);
  };

  if (
    containsBounded(prompt, entry.id) ||
    entry.specRefs.some((value) => containsBounded(prompt, value)) ||
    entry.bugIds.some((value) => containsBounded(prompt, value))
  ) {
    add(100, "exact id");
  }
  if (entry.files.some((value) => containsPath(prompt, value))) add(90, "file path");
  if (entry.symbols.some((value) => containsBounded(prompt, value))) add(80, "symbol");
  if (entry.modules.some((value) => containsBounded(prompt, value))) add(60, "module");
  if (entry.testNames.some((value) => containsBounded(prompt, value))) add(50, "test name");
  if (textMatches(prompt, entry.title)) add(40, "title");
  if (
    textMatches(prompt, entry.summary) ||
    entry.tags.some((value) => containsBounded(prompt, value))
  ) {
    add(20, "summary or tag");
  }

  if (score === 0) return undefined;
  return {
    entry,
    score,
    reasons,
    confidence: reasons.includes("exact id") ? "exact" : score >= 100 ? "high" : "medium",
    relatedIds: [],
    suggestedSections: entry.sectionSummaries,
  };
}

function aggregateMatches(matches: HandoffMatch[], allEntries: HandoffIndexEntry[]): HandoffMatch[] {
  const entriesByGroup = new Map<string, HandoffIndexEntry[]>();
  for (const entry of allEntries) {
    entriesByGroup.set(entry.groupKey, [...(entriesByGroup.get(entry.groupKey) ?? []), entry]);
  }

  const matchesByGroup = new Map<string, HandoffMatch[]>();
  for (const match of matches) {
    matchesByGroup.set(match.entry.groupKey, [...(matchesByGroup.get(match.entry.groupKey) ?? []), match]);
  }

  return [...matchesByGroup.values()].map((groupMatches) => {
    const primary = [...groupMatches].sort(compareMatches)[0];
    if (primary === undefined) throw new Error("Unexpected empty handoff match group.");
    const groupEntries = [...(entriesByGroup.get(primary.entry.groupKey) ?? [])].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    const suggestedSections = collectSectionSummaries(primary.entry, groupEntries);
    return {
      ...primary,
      relatedIds: groupEntries.filter(({ id }) => id !== primary.entry.id).map(({ id }) => id),
      suggestedSections,
    };
  });
}

function collectSectionSummaries(
  primary: HandoffIndexEntry,
  groupEntries: HandoffIndexEntry[],
): HandoffSectionSummary[] {
  const result = new Map<string, HandoffSectionSummary>();
  for (const entry of [primary, ...groupEntries.filter(({ id }) => id !== primary.id)]) {
    for (const section of entry.sectionSummaries) {
      if (!result.has(section.name)) result.set(section.name, section);
    }
  }
  return [...result.values()];
}

function compareMatches(left: HandoffMatch, right: HandoffMatch): number {
  return right.score - left.score || right.entry.createdAt.localeCompare(left.entry.createdAt);
}

function summarizeSection(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function textMatches(prompt: string, text: string): boolean {
  const normalized = normalizeSearchText(text).trim();
  if (normalized.length >= 4 && prompt.includes(normalized)) return true;
  return normalized
    .split(/[^\p{L}\p{N}_-]+/u)
    .some((token) => token.length >= 4 && containsBounded(prompt, token));
}

function containsPath(prompt: string, value: string): boolean {
  const normalized = normalizeSearchText(value).trim();
  return normalized.length > 0 && prompt.includes(normalized);
}

function containsBounded(prompt: string, value: string): boolean {
  const normalized = normalizeSearchText(value).trim();
  if (normalized.length === 0) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped}(?=$|[^\\p{L}\\p{N}_-])`, "u").test(prompt);
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replaceAll("\\", "/");
}

function nextHandoffId(entries: HandoffIndexEntry[]): string {
  const maximum = entries.reduce((current, entry) => {
    const match = /^W(\d+)$/.exec(entry.id);
    return match?.[1] === undefined ? current : Math.max(current, Number.parseInt(match[1], 10));
  }, 0);
  return `W${String(maximum + 1).padStart(3, "0")}`;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Handoff ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function uniqueStrings(values: string[] | undefined): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new Error("Handoff list fields must contain only strings.");
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || fallback;
}

function slugify(value: string): string {
  return sanitizeSegment(value.toLocaleLowerCase(), "handoff").slice(0, 64);
}
