import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  HandoffIndex,
  HandoffIndexEntry,
  HandoffInput,
  HandoffKind,
  HandoffMatch,
  HandoffRouting,
  HandoffSections,
} from "../types.js";
import {
  ensureDirectory,
  pathExists,
  readJson,
  readTextIfPresent,
  writeJsonAtomic,
  writeTextAtomic,
} from "../infrastructure/files.js";
import { withProjectWriteLock } from "../infrastructure/project-write-lock.js";
import {
  buildHandoffGroupKey,
  EMPTY_HANDOFF_INDEX,
  validateHandoffIndex,
} from "./handoff-index.js";
import { readProjectContext, requireProjectRoot } from "./project-context.js";

const SECTION_LABELS: Array<[keyof HandoffSections, string]> = [
  ["objective", "Objective"],
  ["currentState", "Current State"],
  ["workCompleted", "Work Completed"],
  ["bugDiagnosis", "Bug Diagnosis"],
  ["decisionsAndConstraints", "Decisions and Constraints"],
  ["failedAttempts", "Failed Attempts"],
  ["verification", "Verification"],
  ["remainingWork", "Remaining Work"],
  ["risks", "Risks and Unknowns"],
  ["evidence", "Evidence"],
];
const CORE_SECTIONS: Array<keyof HandoffSections> = ["objective", "currentState", "remainingWork"];
const HANDOFF_KINDS = new Set<HandoffKind>([
  "feature",
  "bug",
  "investigation",
  "maintenance",
  "verification",
]);
const MATCH_THRESHOLD = 40;

export async function createHandoff(
  projectDirectory: string,
  rawInput: HandoffInput,
): Promise<{
  ok: true;
  id: string;
  path: string;
  projectRoot: string;
  deduplicated: boolean;
}> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const context = await readProjectContext(projectRoot);
    const indexPath = resolve(projectRoot, context.handoffIndex);
    const index = await readOrRebuildIndex(projectRoot, indexPath, true);
    const input = normalizeInput(rawInput);
    const cycle = sanitizeSegment(input.cycle ?? context.currentCycle, "development");
    const dedupeKey = buildHandoffDedupeKey(input, cycle);
    const duplicate = index.entries.find((entry) => entry.dedupeKey === dedupeKey);
    if (duplicate !== undefined) {
      return {
        ok: true,
        id: duplicate.id,
        path: resolve(projectRoot, duplicate.path),
        projectRoot,
        deduplicated: true,
      };
    }

    const id = nextHandoffId(index.entries);
    const relativePath = `.agent/handoff/records/${cycle}/${id}-${slugify(input.title)}.md`;
    const absolutePath = resolve(projectRoot, relativePath);
    const createdAt = new Date().toISOString();
    const entry = buildIndexEntry(id, cycle, relativePath, createdAt, dedupeKey, input);

    await ensureDirectory(dirname(absolutePath));
    await writeTextAtomic(absolutePath, renderHandoff(entry, input));
    index.entries.push(entry);
    await writeJsonAtomic(indexPath, index);

    return { ok: true, id, path: absolutePath, projectRoot, deduplicated: false };
  });
}

export async function matchHandoffs(
  projectDirectory: string,
  prompt: string,
  limit?: number,
): Promise<HandoffMatch[]> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const indexPath = resolve(projectRoot, context.handoffIndex);
  const index = await readOrRebuildIndex(projectRoot, indexPath, false);
  const normalizedPrompt = normalizeSearchText(prompt);
  const scored = index.entries
    .map((entry) => scoreEntry(entry, normalizedPrompt))
    .filter((result): result is HandoffMatch => result !== undefined && result.score >= MATCH_THRESHOLD);

  let matches: HandoffMatch[];
  if (scored.length > 0) {
    matches = aggregateMatches(scored, index.entries).sort(compareMatches);
  } else if (hasRecentContinuationCue(normalizedPrompt)) {
    const mostRecent = [...index.entries].sort(compareEntriesByRecency)[0];
    matches = mostRecent === undefined
      ? []
      : aggregateMatches([baseMatch(mostRecent, MATCH_THRESHOLD, ["recent continuation cue"])], index.entries);
  } else {
    matches = [];
  }
  return limit === undefined ? matches : matches.slice(0, Math.max(0, limit));
}

export async function rebuildHandoffIndex(projectDirectory: string): Promise<HandoffIndex> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const indexPath = resolve(projectRoot, context.handoffIndex);
  return withProjectWriteLock(projectRoot, async () => {
    const index = await buildIndexFromRecords(projectRoot);
    await writeJsonAtomic(indexPath, index);
    return index;
  });
}

export async function verifyHandoffIndex(projectDirectory: string): Promise<{
  ok: true;
  projectRoot: string;
  entryCount: number;
}> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const stored = validateHandoffIndex(
    await readJson<unknown>(resolve(projectRoot, context.handoffIndex)),
  );
  const rebuilt = await buildIndexFromRecords(projectRoot);
  if (JSON.stringify(stored) !== JSON.stringify(rebuilt)) {
    throw new Error("Handoff index does not match the Markdown fact records.");
  }
  return { ok: true, projectRoot, entryCount: stored.entries.length };
}

function normalizeInput(input: HandoffInput): HandoffInput {
  if (!isRecord(input)) throw new Error("Handoff input must be an object.");
  assertOnlyKeys(input, [
    "title", "summary", "kind", "sections", "cycle", "specRefs", "modules", "symbols",
    "files", "bugIds", "tests", "tags",
  ], "input");
  const kind = requiredText(input.kind, "kind") as HandoffKind;
  if (!HANDOFF_KINDS.has(kind)) throw new Error(`Unsupported handoff kind: ${kind}.`);
  if (!isRecord(input.sections)) throw new Error("Handoff sections must be an object.");
  assertOnlyKeys(input.sections, SECTION_LABELS.map(([key]) => key), "sections");
  const sections = Object.fromEntries(
    SECTION_LABELS.flatMap(([key]) => {
      const value = input.sections[key];
      return typeof value === "string" && value.trim().length > 0 ? [[key, value.trim()]] : [];
    }),
  ) as unknown as HandoffSections;
  for (const key of CORE_SECTIONS) requiredText(sections[key], `sections.${key}`);
  return {
    title: requiredText(input.title, "title"),
    summary: requiredText(input.summary, "summary"),
    kind,
    ...(input.cycle === undefined ? {} : { cycle: requiredText(input.cycle, "cycle") }),
    specRefs: uniqueStrings(input.specRefs),
    modules: uniqueStrings(input.modules),
    symbols: uniqueStrings(input.symbols),
    files: uniqueStrings(input.files).map(normalizeProjectRelativeFile),
    bugIds: uniqueStrings(input.bugIds),
    tests: uniqueStrings(input.tests),
    tags: uniqueStrings(input.tags),
    sections,
  };
}

function buildIndexEntry(
  id: string,
  cycle: string,
  path: string,
  createdAt: string,
  dedupeKey: string,
  input: HandoffInput,
): HandoffIndexEntry {
  const routing: HandoffRouting = {
    specRefs: input.specRefs ?? [],
    bugIds: input.bugIds ?? [],
    modules: input.modules ?? [],
    files: input.files ?? [],
    symbols: input.symbols ?? [],
    tests: input.tests ?? [],
    tags: input.tags ?? [],
  };
  const entry: HandoffIndexEntry = {
    id,
    cycle,
    title: input.title,
    summary: input.summary,
    kind: input.kind,
    routing,
    availableSections: SECTION_LABELS.flatMap(([key]) =>
      input.sections[key]?.trim() ? [key] : [],
    ),
    groupKey: "",
    dedupeKey,
    path,
    createdAt,
  };
  entry.groupKey = buildHandoffGroupKey(entry);
  return entry;
}

function renderHandoff(entry: HandoffIndexEntry, input: HandoffInput): string {
  const frontmatter = [
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
    `available_sections: ${JSON.stringify(entry.availableSections)}`,
    "---",
  ];
  const sections = SECTION_LABELS.flatMap(([key, label]) => {
    const content = input.sections[key]?.trim();
    return content === undefined || content.length === 0 ? [] : [`## ${label}\n\n${content}`];
  });
  return `${frontmatter.join("\n")}\n\n# ${entry.id} ${entry.title}\n\n> ${entry.summary}\n\n${sections.join("\n\n")}\n`;
}

function scoreEntry(entry: HandoffIndexEntry, prompt: string): HandoffMatch | undefined {
  let score = 0;
  const reasons: string[] = [];
  const add = (weight: number, reason: string): void => {
    score += weight;
    reasons.push(reason);
  };
  const routing = entry.routing;
  if (
    containsBounded(prompt, entry.id) ||
    routing.specRefs.some((value) => containsBounded(prompt, value)) ||
    routing.bugIds.some((value) => containsBounded(prompt, value))
  ) add(100, "exact id");
  if (routing.files.some((value) => containsPath(prompt, value))) add(90, "file path");
  if (routing.symbols.some((value) => containsBounded(prompt, value))) add(80, "symbol");
  if (routing.modules.some((value) => containsBounded(prompt, value))) add(60, "module");
  if (routing.tests.some((value) => routingValueMatches(prompt, value))) add(50, "test name");
  if (textMatches(prompt, entry.title)) add(40, "title");
  if (textMatches(prompt, entry.summary) || routing.tags.some((value) => routingValueMatches(prompt, value))) {
    add(20, "summary or tag");
  }
  return score === 0 ? undefined : baseMatch(entry, score, reasons);
}

function baseMatch(entry: HandoffIndexEntry, score: number, reasons: string[]): HandoffMatch {
  return {
    entry,
    score,
    reasons,
    confidence: reasons.includes("exact id") ? "exact" : score >= 100 ? "high" : "medium",
    records: [recordReference(entry)],
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
    const records = [...(entriesByGroup.get(primary.entry.groupKey) ?? [])]
      .sort(compareEntriesByRecency)
      .map(recordReference);
    return { ...primary, records };
  });
}

function recordReference(entry: HandoffIndexEntry) {
  return {
    id: entry.id,
    path: entry.path,
    availableSections: entry.availableSections,
    createdAt: entry.createdAt,
  };
}

async function readOrRebuildIndex(
  projectRoot: string,
  indexPath: string,
  persistMissing: boolean,
): Promise<HandoffIndex> {
  if (await pathExists(indexPath)) return validateHandoffIndex(await readJson<unknown>(indexPath));
  const index = await buildIndexFromRecords(projectRoot);
  if (persistMissing) {
    await ensureDirectory(dirname(indexPath));
    await writeJsonAtomic(indexPath, index);
  }
  return index;
}

async function buildIndexFromRecords(projectRoot: string): Promise<HandoffIndex> {
  const recordsRoot = resolve(projectRoot, ".agent", "handoff", "records");
  if (!(await pathExists(recordsRoot))) return { ...EMPTY_HANDOFF_INDEX, entries: [] };
  const files = await listMarkdownFiles(recordsRoot);
  const entries: HandoffIndexEntry[] = [];
  for (const file of files) {
    const markdown = await readTextIfPresent(file);
    if (markdown === undefined) continue;
    entries.push(parseRecord(projectRoot, file, markdown));
  }
  return validateHandoffIndex({ schemaVersion: 3, entries: entries.sort(compareEntriesByRecency).reverse() });
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".md")) result.push(path);
  }
  return result;
}

function parseRecord(projectRoot: string, path: string, markdown: string): HandoffIndexEntry {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (match?.[1] === undefined) throw new Error(`Handoff record has invalid frontmatter: ${path}`);
  const fields = new Map<string, unknown>();
  for (const line of match[1].split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`Handoff record has invalid frontmatter: ${path}`);
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    fields.set(key, raw === "" ? "" : JSON.parse(raw));
  }
  if (fields.get("schema_version") !== 1) throw new Error(`Handoff record must use schema_version 1: ${path}`);
  const declaredSections = fields.get("available_sections");
  if (!Array.isArray(declaredSections) || declaredSections.some((value) => typeof value !== "string")) {
    throw new Error(`Handoff record available_sections must be a string array: ${path}`);
  }
  const body = markdown.slice(match[0].length);
  const labels = new Map(SECTION_LABELS.map(([key, label]) => [label, key]));
  const actualSections: string[] = [];
  for (const heading of body.matchAll(/^## ([^\r\n]+)\r?$/gmu)) {
    const label = heading[1];
    const key = label === undefined ? undefined : labels.get(label);
    if (key === undefined) throw new Error(`Handoff record contains an unsupported section heading: ${path}`);
    if (actualSections.includes(key)) throw new Error(`Handoff record contains a duplicate section: ${path}`);
    actualSections.push(key);
  }
  if (JSON.stringify(declaredSections) !== JSON.stringify(actualSections)) {
    throw new Error(`Handoff record available_sections does not match its Markdown sections: ${path}`);
  }
  for (const core of CORE_SECTIONS) {
    if (!actualSections.includes(core)) throw new Error(`Handoff record is missing core section ${core}: ${path}`);
  }
  if (/^(?:未记录。|根因未确认。)\s*$/gmu.test(body)) {
    throw new Error(`Handoff record contains placeholder section content: ${path}`);
  }
  const routing = {
    specRefs: fields.get("spec_refs"),
    bugIds: fields.get("bug_ids"),
    modules: fields.get("modules"),
    files: fields.get("files"),
    symbols: fields.get("symbols"),
    tests: fields.get("tests"),
    tags: fields.get("tags"),
  };
  return validateHandoffIndex({
    schemaVersion: 3,
    entries: [{
      id: fields.get("id"),
      title: fields.get("title"),
      summary: fields.get("summary"),
      createdAt: fields.get("created_at"),
      cycle: fields.get("cycle"),
      kind: fields.get("kind"),
      groupKey: fields.get("group_key"),
      dedupeKey: fields.get("dedupe_key"),
      routing,
      availableSections: declaredSections,
      path: relative(projectRoot, path).replaceAll("\\", "/"),
    }],
  }).entries[0]!;
}

function compareMatches(left: HandoffMatch, right: HandoffMatch): number {
  return right.score - left.score || compareEntriesByRecency(left.entry, right.entry);
}

function compareEntriesByRecency(left: HandoffIndexEntry, right: HandoffIndexEntry): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function textMatches(prompt: string, text: string): boolean {
  const normalized = normalizeSearchText(text).trim();
  if (normalized.length >= 4 && prompt.includes(normalized)) return true;
  return normalized.split(/[^\p{L}\p{N}_-]+/u).some((token) =>
    containsCjkOverlap(prompt, token) || (token.length >= 4 && containsBounded(prompt, token))
  );
}

function containsCjkOverlap(prompt: string, token: string): boolean {
  const runs = token.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? [];
  for (const run of runs) {
    for (let size = Math.min(8, run.length); size >= 3; size -= 1) {
      for (let offset = 0; offset <= run.length - size; offset += 1) {
        if (prompt.includes(run.slice(offset, offset + size))) return true;
      }
    }
  }
  return false;
}

function routingValueMatches(prompt: string, value: string): boolean {
  const normalized = normalizeSearchText(value).trim();
  return containsBounded(prompt, normalized) || containsCjkOverlap(prompt, normalized);
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
  return value.normalize("NFKC").toLocaleLowerCase().replaceAll("\\", "/");
}

function hasRecentContinuationCue(prompt: string): boolean {
  return /上次|上一个窗口|上一窗口|接着上次|继续之前|之前的(?:工作|任务)|刚才的(?:工作|任务)|continue\s+(?:the\s+)?(?:previous|last)|pick\s+up\s+where/u.test(prompt);
}

function buildHandoffDedupeKey(input: HandoffInput, cycle: string): string {
  const sections = Object.fromEntries(
    SECTION_LABELS.map(([key]) => [key, normalizeDedupeText(input.sections[key] ?? "")]),
  );
  const canonical = {
    cycle: normalizeDedupeText(cycle),
    title: normalizeDedupeText(input.title),
    summary: normalizeDedupeText(input.summary),
    kind: input.kind,
    specRefs: canonicalList(input.specRefs),
    modules: canonicalList(input.modules),
    symbols: canonicalList(input.symbols),
    files: canonicalList(input.files),
    bugIds: canonicalList(input.bugIds),
    tests: canonicalList(input.tests),
    tags: canonicalList(input.tags),
    sections,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

function canonicalList(values: string[] | undefined): string[] {
  return [...(values ?? [])].map(normalizeDedupeText).filter(Boolean).sort();
}

function normalizeDedupeText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/gu, " ").trim();
}

function nextHandoffId(entries: HandoffIndexEntry[]): string {
  const maximum = entries.reduce((current, entry) => {
    const match = /^W(\d+)$/u.exec(entry.id);
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

function normalizeProjectRelativeFile(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Handoff files must use project-relative paths.");
  }
  return normalized.replace(/^\.\//u, "");
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly (string | number | symbol)[],
  field: string,
): void {
  const allowedSet = new Set(allowed.map(String));
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) throw new Error(`Unsupported handoff ${field} field: ${unknown}.`);
}

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return sanitized || fallback;
}

function slugify(value: string): string {
  return sanitizeSegment(value.toLocaleLowerCase(), "handoff").slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
