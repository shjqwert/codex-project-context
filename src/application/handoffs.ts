import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  HandoffCheckpointInput,
  HandoffIndex,
  HandoffIndexEntry,
  HandoffInput,
  HandoffKind,
  HandoffMatch,
  HandoffRecordReference,
  HandoffRouting,
  HandoffSections,
  HandoffStatus,
  HandoffWriteInput,
  LegacyHandoffIndex,
  LegacyHandoffIndexEntry,
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
  normalizeHandoffAliases,
  validateHandoffIndex,
} from "./handoff-index.js";
import { searchHandoffsBm25, type Bm25Hit } from "./bm25.js";
import { readProjectContext, requireProjectRoot } from "./project-context.js";

const SECTION_LABELS: Array<[keyof HandoffSections, string, string]> = [
  ["objective", "Objective", "目标"],
  ["currentState", "Current State", "当前状态"],
  ["workCompleted", "Work Completed", "已完成工作"],
  ["bugDiagnosis", "Bug Diagnosis", "Bug 诊断"],
  ["decisionsAndConstraints", "Decisions and Constraints", "决策与约束"],
  ["failedAttempts", "Failed Attempts", "失败尝试"],
  ["verification", "Verification", "验证"],
  ["remainingWork", "Remaining Work", "剩余工作"],
  ["risks", "Risks and Unknowns", "风险与未知"],
  ["evidence", "Evidence", "证据"],
];
const CORE_SECTIONS: Array<keyof HandoffSections> = ["objective", "currentState", "remainingWork"];
const HANDOFF_KINDS = new Set<HandoffKind>([
  "feature", "bug", "investigation", "maintenance", "verification",
]);
const HANDOFF_STATUSES = new Set<HandoffStatus>(["active", "blocked", "completed", "superseded"]);
const CLOSED_STATUSES = new Set<HandoffStatus>(["completed", "superseded"]);
const MATCH_THRESHOLD = 40;
const BM25_MATCH_SCORE = 30;

export type HandoffWriteResult =
  | {
      ok: true;
      action: "created" | "updated" | "deduplicated" | "checkpointed";
      workId: string;
      revision: number;
      status: HandoffStatus;
      deduplicated: boolean;
      snapshotPath?: string;
      checkpointReason?: string;
    }
  | {
      ok: false;
      action: "conflict";
      workId: string;
      expectedRevision: number;
      actualRevision: number;
      status: HandoffStatus;
    };

interface ParsedCurrentRecord {
  entry: HandoffIndexEntry;
  input: HandoffInput;
  checkpointed: boolean;
}

interface ParsedLegacyRecord {
  entry: LegacyHandoffIndexEntry;
  input: HandoffInput;
}

interface BuildOptions {
  repairMissingCheckpoints?: boolean;
  validateHistory?: boolean;
}

export async function createHandoff(
  projectDirectory: string,
  rawInput: HandoffWriteInput,
): Promise<HandoffWriteResult> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const context = await readProjectContext(projectRoot);
    const indexPath = resolve(projectRoot, context.handoffIndex);
    const index = await readOrRebuildIndex(projectRoot, indexPath, true);
    if (isCheckpointInput(rawInput)) {
      return checkpointCurrent(projectRoot, indexPath, index, normalizeCheckpointInput(rawInput));
    }
    const input = normalizeInput(rawInput);
    if (input.workId === undefined) {
      await assertVirtualEntriesConsistent(projectRoot, index);
      return createCurrent(projectRoot, indexPath, index, input, context.currentCycle);
    }
    return updateCurrent(projectRoot, indexPath, index, input);
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
  let index = await readOrRebuildIndex(projectRoot, indexPath, false);
  let matches = matchHandoffEntries(index.entries, prompt);
  if (await matchedCurrentIsStaleOrInvalid(projectRoot, matches)) {
    index = await withProjectWriteLock(projectRoot, async () => {
      const rebuilt = await buildIndexFromStorage(projectRoot, { repairMissingCheckpoints: true });
      await ensureDirectory(dirname(indexPath));
      await writeJsonAtomic(indexPath, rebuilt);
      return rebuilt;
    });
    matches = matchHandoffEntries(index.entries, prompt);
    if (await matchedCurrentIsStaleOrInvalid(projectRoot, matches)) {
      throw new Error("Matched handoff current file is invalid after index repair.");
    }
  }
  return limit === undefined ? matches : matches.slice(0, Math.max(0, limit));
}

export async function getHandoffHistory(
  projectDirectory: string,
  workId: string,
  revision?: number,
): Promise<{
  ok: true;
  workId: string;
  currentRevision: number;
  records: HandoffRecordReference[];
}> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const index = await readOrRebuildIndex(projectRoot, resolve(projectRoot, context.handoffIndex), false);
  const normalizedWorkId = normalizeWorkId(workId);
  const entry = index.entries.find((candidate) =>
    candidate.workId === normalizedWorkId || candidate.legacyRecordIds.includes(normalizedWorkId)
  );
  if (entry === undefined) throw new Error(`Unknown handoff workId: ${workId}.`);
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
    throw new Error("Handoff history revision must be a positive integer.");
  }
  const records = await collectHistoryRecords(projectRoot, entry);
  return {
    ok: true,
    workId: entry.workId,
    currentRevision: entry.revision,
    records: revision === undefined ? records : records.filter((record) => record.revision === revision),
  };
}

export function matchHandoffEntries(
  entries: HandoffIndexEntry[],
  prompt: string,
  bm25Search: (entries: HandoffIndexEntry[], query: string) => Bm25Hit[] = searchHandoffsBm25,
): HandoffMatch[] {
  const normalizedPrompt = normalizeSearchText(prompt);
  const ruleMatches = entries
    .map((entry) => scoreRuleEntry(entry, normalizedPrompt))
    .filter((result): result is HandoffMatch => result !== undefined && result.score >= MATCH_THRESHOLD);
  let lexicalHits: Bm25Hit[] = [];
  try {
    lexicalHits = bm25Search(entries, prompt);
  } catch {
    // BM25 is optional; deterministic routing must remain available.
  }
  const merged = new Map<string, HandoffMatch>();
  for (const match of ruleMatches) merged.set(match.entry.workId, match);
  for (const hit of lexicalHits) {
    if (!merged.has(hit.entry.workId)) merged.set(hit.entry.workId, bm25Match(hit));
  }
  if (merged.size > 0) return [...merged.values()].sort(compareMatches);
  if (!hasRecentContinuationCue(normalizedPrompt)) return [];
  const preferred = [...entries]
    .filter((entry) => !CLOSED_STATUSES.has(entry.status))
    .sort(compareEntriesByRecency)[0]
    ?? [...entries].sort(compareEntriesByRecency)[0];
  return preferred === undefined ? [] : [baseMatch(preferred, MATCH_THRESHOLD, ["recent continuation cue"])];
}

export async function rebuildHandoffIndex(projectDirectory: string): Promise<HandoffIndex> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const indexPath = resolve(projectRoot, context.handoffIndex);
  return withProjectWriteLock(projectRoot, async () => {
    const index = await buildIndexFromStorage(projectRoot, {
      repairMissingCheckpoints: true,
      validateHistory: true,
    });
    await writeJsonAtomic(indexPath, index);
    return index;
  });
}

export async function verifyHandoffIndex(projectDirectory: string): Promise<{
  ok: true;
  projectRoot: string;
  workCount: number;
  currentCount: number;
  historyCount: number;
  legacyRecordCount: number;
}> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const stored = validateHandoffIndex(await readJson<unknown>(resolve(projectRoot, context.handoffIndex)));
  const history = await scanCheckpointRecords(projectRoot, true);
  const legacy = await scanLegacyRecords(projectRoot);
  if (stored.schemaVersion === 3) {
    const expected = legacy.map(({ entry }) => entry).sort(compareLegacyEntriesAscending);
    const actual = [...stored.entries].sort(compareLegacyEntriesAscending);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("Handoff index does not match the Markdown fact records.");
    }
    return {
      ok: true,
      projectRoot,
      workCount: groupLegacyEntries(stored.entries).length,
      currentCount: 0,
      historyCount: history.length,
      legacyRecordCount: legacy.length,
    };
  }
  const rebuilt = await buildIndexFromStorage(projectRoot, { validateHistory: true });
  if (JSON.stringify(stored) !== JSON.stringify(rebuilt)) {
    throw new Error("Handoff index does not match the current Markdown records.");
  }
  return {
    ok: true,
    projectRoot,
    workCount: stored.entries.length,
    currentCount: stored.entries.filter((entry) => isCurrentPath(entry.currentPath)).length,
    historyCount: history.length,
    legacyRecordCount: legacy.length,
  };
}

async function createCurrent(
  projectRoot: string,
  indexPath: string,
  index: HandoffIndex,
  input: HandoffInput,
  defaultCycle: string,
): Promise<HandoffWriteResult> {
  const cycle = sanitizeSegment(input.cycle ?? defaultCycle, "development");
  const status = input.status ?? "active";
  const dedupeKey = buildHandoffDedupeKey(input, cycle, status);
  const legacyDedupeKey = buildLegacyHandoffDedupeKey(input, cycle);
  const duplicate = index.entries.find((entry) =>
    entry.dedupeKey === dedupeKey
    || (!isCurrentPath(entry.currentPath) && entry.dedupeKey === legacyDedupeKey)
  );
  if (duplicate !== undefined) return deduplicatedResult(duplicate);
  const workId = nextHandoffId(index.entries);
  const currentPath = `.agent/handoff/current/${cycle}/${workId}-${slugify(input.title)}.md`;
  const now = new Date().toISOString();
  const entry = buildIndexEntry({
    workId,
    cycle,
    currentPath,
    revision: 1,
    status,
    createdAt: now,
    updatedAt: now,
    dedupeKey,
    legacyRecordIds: [],
    input,
  });
  const checkpointed = input.checkpoint === true;
  await writeCurrentAndOptionalCheckpoint(projectRoot, entry, input, checkpointed);
  index.entries.push(entry);
  await writeJsonAtomic(indexPath, sortedIndex(index));
  return successResult("created", entry, false, checkpointed, input.checkpointReason);
}

async function updateCurrent(
  projectRoot: string,
  indexPath: string,
  index: HandoffIndex,
  input: HandoffInput,
): Promise<HandoffWriteResult> {
  const workId = normalizeWorkId(input.workId ?? "");
  const current = index.entries.find((entry) => entry.workId === workId);
  if (current === undefined) throw new Error(`Unknown handoff workId: ${workId}.`);
  const expectedRevision = requiredRevision(input.expectedRevision, "expectedRevision");
  if (expectedRevision !== current.revision) return conflictResult(current, expectedRevision);
  await assertEntrySourceConsistent(projectRoot, current);
  const status = input.status ?? current.status;
  const dedupeKey = buildHandoffDedupeKey(input, current.cycle, status);
  const legacyDedupeKey = buildLegacyHandoffDedupeKey(input, current.cycle);
  if (
    dedupeKey === current.dedupeKey
    || (!isCurrentPath(current.currentPath) && legacyDedupeKey === current.dedupeKey)
  ) return deduplicatedResult(current);
  if (CLOSED_STATUSES.has(current.status) && (input.reopen !== true || status !== "active")) {
    throw new Error("Closed handoff work requires reopen: true and status active before an update.");
  }
  if (!CLOSED_STATUSES.has(current.status) && input.reopen === true) {
    throw new Error("Handoff reopen is only valid for completed or superseded work.");
  }
  const currentPath = isCurrentPath(current.currentPath)
    ? current.currentPath
    : `.agent/handoff/current/${current.cycle}/${current.workId}-${slugify(current.title)}.md`;
  const entry = buildIndexEntry({
    workId: current.workId,
    cycle: current.cycle,
    currentPath,
    revision: current.revision + 1,
    status,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    dedupeKey,
    legacyRecordIds: current.legacyRecordIds,
    input,
    groupKey: current.groupKey,
  });
  const checkpointed = input.checkpoint === true;
  await writeCurrentAndOptionalCheckpoint(projectRoot, entry, input, checkpointed);
  replaceEntry(index, entry);
  await writeJsonAtomic(indexPath, sortedIndex(index));
  return successResult("updated", entry, false, checkpointed, input.checkpointReason);
}

async function checkpointCurrent(
  projectRoot: string,
  indexPath: string,
  index: HandoffIndex,
  input: HandoffCheckpointInput,
): Promise<HandoffWriteResult> {
  const workId = normalizeWorkId(input.workId);
  const entry = index.entries.find((candidate) => candidate.workId === workId);
  if (entry === undefined) throw new Error(`Unknown handoff workId: ${workId}.`);
  if (input.expectedRevision !== entry.revision) return conflictResult(entry, input.expectedRevision);
  await assertEntrySourceConsistent(projectRoot, entry);
  const snapshotPath = historyPath(entry);
  if (await pathExists(resolve(projectRoot, snapshotPath))) {
    return {
      ok: true,
      action: "checkpointed",
      workId,
      revision: entry.revision,
      status: entry.status,
      deduplicated: true,
      snapshotPath,
      checkpointReason: input.checkpointReason,
    };
  }
  const source = await parseEntrySource(projectRoot, entry);
  const materializedEntry = isCurrentPath(entry.currentPath)
    ? entry
    : { ...entry, currentPath: `.agent/handoff/current/${entry.cycle}/${entry.workId}-${slugify(entry.title)}.md` };
  const currentAbsolute = resolve(projectRoot, materializedEntry.currentPath);
  await ensureDirectory(dirname(currentAbsolute));
  await writeTextAtomic(currentAbsolute, renderHandoff(materializedEntry, source.input, "current", true));
  const snapshot = resolve(projectRoot, snapshotPath);
  await ensureDirectory(dirname(snapshot));
  await writeTextAtomic(snapshot, renderHandoff(materializedEntry, source.input, "checkpoint", true));
  replaceEntry(index, materializedEntry);
  await writeJsonAtomic(indexPath, sortedIndex(index));
  return {
    ok: true,
    action: "checkpointed",
    workId,
    revision: entry.revision,
    status: entry.status,
    deduplicated: false,
    snapshotPath,
    checkpointReason: input.checkpointReason,
  };
}

async function writeCurrentAndOptionalCheckpoint(
  projectRoot: string,
  entry: HandoffIndexEntry,
  input: HandoffInput,
  checkpointed: boolean,
): Promise<void> {
  const currentAbsolute = resolve(projectRoot, entry.currentPath);
  await ensureDirectory(dirname(currentAbsolute));
  await writeTextAtomic(currentAbsolute, renderHandoff(entry, input, "current", checkpointed));
  if (!checkpointed) return;
  const snapshot = resolve(projectRoot, historyPath(entry));
  await ensureDirectory(dirname(snapshot));
  await writeTextAtomic(snapshot, renderHandoff(entry, input, "checkpoint", true));
}

function buildIndexEntry(args: {
  workId: string;
  cycle: string;
  currentPath: string;
  revision: number;
  status: HandoffStatus;
  createdAt: string;
  updatedAt: string;
  dedupeKey: string;
  legacyRecordIds: string[];
  input: HandoffInput;
  groupKey?: string;
}): HandoffIndexEntry {
  const entry: HandoffIndexEntry = {
    workId: args.workId,
    cycle: args.cycle,
    title: args.input.title,
    summary: args.input.summary,
    kind: args.input.kind,
    routing: routingFromInput(args.input),
    availableSections: availableSections(args.input.sections),
    groupKey: args.groupKey ?? "",
    dedupeKey: args.dedupeKey,
    currentPath: args.currentPath,
    revision: args.revision,
    status: args.status,
    legacyRecordIds: [...args.legacyRecordIds],
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  };
  if (entry.groupKey.length === 0) entry.groupKey = buildHandoffGroupKey(entry);
  return validateV4Entry(entry);
}

function renderHandoff(
  entry: HandoffIndexEntry,
  input: HandoffInput,
  recordType: "current" | "checkpoint",
  checkpointed: boolean,
): string {
  const frontmatter = [
    "---",
    "schema_version: 2",
    `record_type: ${JSON.stringify(recordType)}`,
    `work_id: ${JSON.stringify(entry.workId)}`,
    `revision: ${entry.revision}`,
    `status: ${JSON.stringify(entry.status)}`,
    `checkpointed: ${checkpointed}`,
    `title: ${JSON.stringify(entry.title)}`,
    `summary: ${JSON.stringify(entry.summary)}`,
    `created_at: ${JSON.stringify(entry.createdAt)}`,
    `updated_at: ${JSON.stringify(entry.updatedAt)}`,
    `cycle: ${JSON.stringify(entry.cycle)}`,
    `kind: ${JSON.stringify(entry.kind)}`,
    `group_key: ${JSON.stringify(entry.groupKey)}`,
    `dedupe_key: ${JSON.stringify(entry.dedupeKey)}`,
    `legacy_record_ids: ${JSON.stringify(entry.legacyRecordIds)}`,
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
  ];
  const sections = SECTION_LABELS.flatMap(([key, , chineseLabel]) => {
    const content = input.sections[key]?.trim();
    return content === undefined || content.length === 0 ? [] : [`## ${chineseLabel}\n\n${content}`];
  });
  return `${frontmatter.join("\n")}\n\n# ${entry.workId} ${entry.title}\n\n> ${entry.summary}\n\n${sections.join("\n\n")}\n`;
}

function normalizeInput(input: HandoffInput): HandoffInput {
  if (!isRecord(input)) throw new Error("Handoff input must be an object.");
  assertOnlyKeys(input, [
    "title", "summary", "kind", "sections", "cycle", "specRefs", "modules", "symbols",
    "files", "bugIds", "tests", "tags", "aliases", "workId", "expectedRevision", "status",
    "reopen", "checkpoint", "checkpointReason",
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
  const title = requiredText(input.title, "title");
  const summary = requiredText(input.summary, "summary");
  const aliases = normalizeHandoffAliases(input.aliases);
  const repeatedContent = new Set([title, summary].map(normalizeDedupeText));
  if (aliases.some((alias) => repeatedContent.has(normalizeDedupeText(alias)))) {
    throw new Error("Handoff aliases must not duplicate the title or summary.");
  }
  if (input.workId !== undefined && input.expectedRevision === undefined) {
    throw new Error("Handoff updates require expectedRevision.");
  }
  if (input.workId === undefined && input.expectedRevision !== undefined) {
    throw new Error("Handoff expectedRevision requires workId.");
  }
  if (input.status !== undefined && !HANDOFF_STATUSES.has(input.status)) {
    throw new Error(`Unsupported handoff status: ${String(input.status)}.`);
  }
  if (input.checkpoint === true) requiredText(input.checkpointReason, "checkpointReason");
  if (input.checkpoint !== true && input.checkpointReason !== undefined) {
    throw new Error("Handoff checkpointReason requires checkpoint: true.");
  }
  return {
    title,
    summary,
    kind,
    sections,
    ...(input.cycle === undefined ? {} : { cycle: requiredText(input.cycle, "cycle") }),
    specRefs: uniqueStrings(input.specRefs),
    modules: uniqueStrings(input.modules),
    symbols: uniqueStrings(input.symbols),
    files: uniqueStrings(input.files).map(normalizeProjectRelativeFile),
    bugIds: uniqueStrings(input.bugIds),
    tests: uniqueStrings(input.tests),
    tags: uniqueStrings(input.tags),
    aliases,
    ...(input.workId === undefined ? {} : { workId: normalizeWorkId(input.workId) }),
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: requiredRevision(input.expectedRevision, "expectedRevision") }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.reopen === true ? { reopen: true } : {}),
    ...(input.checkpoint === true ? { checkpoint: true, checkpointReason: requiredText(input.checkpointReason, "checkpointReason") } : {}),
  };
}

function normalizeCheckpointInput(input: HandoffCheckpointInput): HandoffCheckpointInput {
  if (!isRecord(input)) throw new Error("Handoff checkpoint input must be an object.");
  assertOnlyKeys(input, ["workId", "expectedRevision", "checkpointOnly", "checkpointReason"], "checkpoint input");
  if (input.checkpointOnly !== true) throw new Error("Handoff checkpointOnly must be true.");
  return {
    workId: normalizeWorkId(input.workId),
    expectedRevision: requiredRevision(input.expectedRevision, "expectedRevision"),
    checkpointOnly: true,
    checkpointReason: requiredText(input.checkpointReason, "checkpointReason"),
  };
}

async function readOrRebuildIndex(
  projectRoot: string,
  indexPath: string,
  persistMissing: boolean,
): Promise<HandoffIndex> {
  if (await pathExists(indexPath)) {
    const stored = validateHandoffIndex(await readJson<unknown>(indexPath));
    if (stored.schemaVersion === 3) return legacyIndexToRuntime(stored);
    if (!(await storageMayBeNewer(projectRoot, indexPath))) return stored;
    const rebuilt = await buildIndexFromStorage(projectRoot, { repairMissingCheckpoints: true });
    await writeJsonAtomic(indexPath, rebuilt);
    return rebuilt;
  }
  const index = await buildIndexFromStorage(projectRoot, { repairMissingCheckpoints: persistMissing });
  if (persistMissing) {
    await ensureDirectory(dirname(indexPath));
    await writeJsonAtomic(indexPath, index);
  }
  return index;
}

async function buildIndexFromStorage(projectRoot: string, options: BuildOptions = {}): Promise<HandoffIndex> {
  const currentRecords = await scanCurrentRecords(projectRoot);
  const legacyRecords = await scanLegacyRecords(projectRoot);
  const entries = new Map<string, HandoffIndexEntry>();
  for (const parsed of currentRecords) {
    if (entries.has(parsed.entry.workId)) throw new Error(`Duplicate handoff current workId: ${parsed.entry.workId}.`);
    entries.set(parsed.entry.workId, parsed.entry);
  }
  for (const virtual of groupLegacyEntries(legacyRecords.map(({ entry }) => entry))) {
    if (!entries.has(virtual.workId)) entries.set(virtual.workId, virtual);
  }
  if (options.validateHistory === true) await scanCheckpointRecords(projectRoot, true);
  if (options.repairMissingCheckpoints === true) {
    for (const parsed of currentRecords.filter((record) => record.checkpointed)) {
      const snapshot = resolve(projectRoot, historyPath(parsed.entry));
      if (!(await pathExists(snapshot))) {
        await ensureDirectory(dirname(snapshot));
        await writeTextAtomic(snapshot, renderHandoff(parsed.entry, parsed.input, "checkpoint", true));
      }
    }
  }
  return validateV4Index({ schemaVersion: 4, entries: [...entries.values()].sort(compareEntriesAscending) });
}

async function scanCurrentRecords(projectRoot: string): Promise<ParsedCurrentRecord[]> {
  const root = resolve(projectRoot, ".agent", "handoff", "current");
  if (!(await pathExists(root))) return [];
  const records: ParsedCurrentRecord[] = [];
  for (const file of await listMarkdownFiles(root)) {
    const markdown = await readTextIfPresent(file);
    if (markdown !== undefined) records.push(parseCurrentRecord(projectRoot, file, markdown, "current"));
  }
  return records;
}

async function scanCheckpointRecords(projectRoot: string, strict: boolean): Promise<ParsedCurrentRecord[]> {
  const root = resolve(projectRoot, ".agent", "handoff", "history");
  if (!(await pathExists(root))) return [];
  const records: ParsedCurrentRecord[] = [];
  for (const file of await listMarkdownFiles(root)) {
    const markdown = await readTextIfPresent(file);
    if (markdown === undefined) continue;
    try {
      records.push(parseCurrentRecord(projectRoot, file, markdown, "checkpoint"));
    } catch (error) {
      if (strict) throw error;
    }
  }
  return records;
}

async function scanLegacyRecords(projectRoot: string): Promise<ParsedLegacyRecord[]> {
  const root = resolve(projectRoot, ".agent", "handoff", "records");
  if (!(await pathExists(root))) return [];
  const records: ParsedLegacyRecord[] = [];
  for (const file of await listMarkdownFiles(root)) {
    const markdown = await readTextIfPresent(file);
    if (markdown !== undefined) records.push(parseLegacyRecord(projectRoot, file, markdown));
  }
  return records;
}

function parseCurrentRecord(
  projectRoot: string,
  path: string,
  markdown: string,
  expectedType: "current" | "checkpoint",
): ParsedCurrentRecord {
  const { fields, body } = parseFrontmatter(path, markdown);
  if (fields.get("schema_version") !== 2) throw new Error(`Handoff current must use schema_version 2: ${path}`);
  if (fields.get("record_type") !== expectedType) throw new Error(`Handoff record_type must be ${expectedType}: ${path}`);
  const sections = parseSections(path, body, fields.get("available_sections"));
  const currentPath = expectedType === "current"
    ? relative(projectRoot, path).replaceAll("\\", "/")
    : inferCurrentPathFromCheckpoint(fields);
  const entry = validateV4Entry({
    workId: fields.get("work_id"),
    cycle: fields.get("cycle"),
    title: fields.get("title"),
    summary: fields.get("summary"),
    kind: fields.get("kind"),
    routing: routingFromFields(fields),
    availableSections: fields.get("available_sections"),
    groupKey: fields.get("group_key"),
    dedupeKey: fields.get("dedupe_key"),
    currentPath,
    revision: fields.get("revision"),
    status: fields.get("status"),
    legacyRecordIds: fields.get("legacy_record_ids") ?? [],
    createdAt: fields.get("created_at"),
    updatedAt: fields.get("updated_at"),
  });
  return {
    entry,
    input: inputFromEntry(entry, sections),
    checkpointed: fields.get("checkpointed") === true,
  };
}

function parseLegacyRecord(projectRoot: string, path: string, markdown: string): ParsedLegacyRecord {
  const { fields, body } = parseFrontmatter(path, markdown);
  if (fields.get("schema_version") !== 1) throw new Error(`Handoff record must use schema_version 1: ${path}`);
  const sections = parseSections(path, body, fields.get("available_sections"));
  const stored = validateHandoffIndex({
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
      routing: routingFromFields(fields),
      availableSections: fields.get("available_sections"),
      path: relative(projectRoot, path).replaceAll("\\", "/"),
    }],
  });
  if (stored.schemaVersion !== 3 || stored.entries[0] === undefined) {
    throw new Error(`Unexpected handoff record schema: ${path}`);
  }
  const entry = stored.entries[0];
  return { entry, input: legacyInput(entry, sections) };
}

function parseFrontmatter(path: string, markdown: string): { fields: Map<string, unknown>; body: string } {
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
  return { fields, body: markdown.slice(match[0].length) };
}

function parseSections(path: string, body: string, declared: unknown): HandoffSections {
  if (!Array.isArray(declared) || declared.some((value) => typeof value !== "string")) {
    throw new Error(`Handoff record available_sections must be a string array: ${path}`);
  }
  const labels = new Map<string, keyof HandoffSections>();
  for (const [key, english, chinese] of SECTION_LABELS) {
    labels.set(english, key);
    labels.set(chinese, key);
  }
  const matches = [...body.matchAll(/^## ([^\r\n]+)\r?$/gmu)];
  const actual: string[] = [];
  const sections: Partial<HandoffSections> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined) continue;
    const label = match[1];
    const key = label === undefined ? undefined : labels.get(label);
    if (key === undefined) throw new Error(`Handoff record contains an unsupported section heading: ${path}`);
    if (actual.includes(key)) throw new Error(`Handoff record contains a duplicate section: ${path}`);
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const content = body.slice(start, end).trim();
    if (content.length === 0) throw new Error(`Handoff record contains an empty section: ${path}`);
    actual.push(key);
    sections[key] = content;
  }
  if (JSON.stringify(declared) !== JSON.stringify(actual)) {
    throw new Error(`Handoff record available_sections does not match its Markdown sections: ${path}`);
  }
  for (const core of CORE_SECTIONS) {
    if (!actual.includes(core)) throw new Error(`Handoff record is missing core section ${core}: ${path}`);
  }
  if (/^(?:未记录。|根因未确认。)\s*$/gmu.test(body)) {
    throw new Error(`Handoff record contains placeholder section content: ${path}`);
  }
  return sections as HandoffSections;
}

function groupLegacyEntries(entries: LegacyHandoffIndexEntry[]): HandoffIndexEntry[] {
  const groups = new Map<string, LegacyHandoffIndexEntry[]>();
  for (const entry of entries) groups.set(entry.groupKey, [...(groups.get(entry.groupKey) ?? []), entry]);
  return [...groups.values()].map((records) => {
    const ordered = [...records].sort(compareLegacyEntriesAscending);
    const first = ordered[0];
    const latest = ordered.at(-1);
    if (first === undefined || latest === undefined) throw new Error("Unexpected empty legacy handoff group.");
    return validateV4Entry({
      workId: first.id,
      cycle: latest.cycle,
      title: latest.title,
      summary: latest.summary,
      kind: latest.kind,
      routing: latest.routing,
      availableSections: latest.availableSections,
      groupKey: latest.groupKey,
      dedupeKey: latest.dedupeKey,
      currentPath: latest.path,
      revision: ordered.length,
      status: "active",
      legacyRecordIds: ordered.map((record) => record.id),
      createdAt: first.createdAt,
      updatedAt: latest.createdAt,
    });
  }).sort(compareEntriesAscending);
}

function legacyIndexToRuntime(index: LegacyHandoffIndex): HandoffIndex {
  return validateV4Index({ schemaVersion: 4, entries: groupLegacyEntries(index.entries) });
}

async function collectHistoryRecords(projectRoot: string, entry: HandoffIndexEntry): Promise<HandoffRecordReference[]> {
  const legacy = (await scanLegacyRecords(projectRoot))
    .map(({ entry: record }) => record)
    .filter((record) => entry.legacyRecordIds.includes(record.id))
    .sort(compareLegacyEntriesAscending)
    .map((record, index): HandoffRecordReference => ({
      workId: entry.workId,
      revision: index + 1,
      path: record.path,
      availableSections: record.availableSections,
      createdAt: record.createdAt,
    }));
  const checkpoints = (await scanCheckpointRecords(projectRoot, true))
    .filter((record) => record.entry.workId === entry.workId)
    .map(({ entry: record }): HandoffRecordReference => ({
      workId: entry.workId,
      revision: record.revision,
      path: historyPath(record),
      availableSections: record.availableSections,
      createdAt: record.updatedAt,
    }));
  const byRevision = new Map<number, HandoffRecordReference>();
  for (const record of [...legacy, ...checkpoints]) byRevision.set(record.revision, record);
  return [...byRevision.values()].sort((left, right) => left.revision - right.revision);
}

async function parseEntrySource(projectRoot: string, entry: HandoffIndexEntry): Promise<{ input: HandoffInput }> {
  const absolute = resolve(projectRoot, entry.currentPath);
  const markdown = await readTextIfPresent(absolute);
  if (markdown === undefined) throw new Error(`Handoff current file is missing: ${entry.currentPath}.`);
  return isCurrentPath(entry.currentPath)
    ? parseCurrentRecord(projectRoot, absolute, markdown, "current")
    : parseLegacyRecord(projectRoot, absolute, markdown);
}

async function assertEntrySourceConsistent(projectRoot: string, entry: HandoffIndexEntry): Promise<void> {
  if (!isCurrentPath(entry.currentPath)) {
    const legacy = groupLegacyEntries((await scanLegacyRecords(projectRoot)).map(({ entry: record }) => record));
    const rebuilt = legacy.find((candidate) => candidate.workId === entry.workId);
    if (rebuilt === undefined || entryStateSignature(rebuilt) !== entryStateSignature(entry)) {
      throw new Error(`Handoff legacy source does not match indexed work ${entry.workId}.`);
    }
    return;
  }
  const absolute = resolve(projectRoot, entry.currentPath);
  const markdown = await readTextIfPresent(absolute);
  if (markdown === undefined) throw new Error(`Handoff current file is missing: ${entry.currentPath}.`);
  const parsed = parseCurrentRecord(projectRoot, absolute, markdown, "current");
  if (entryStateSignature(parsed.entry) !== entryStateSignature(entry)) {
    throw new Error(`Handoff current source does not match indexed work ${entry.workId}.`);
  }
}

async function assertVirtualEntriesConsistent(projectRoot: string, index: HandoffIndex): Promise<void> {
  const virtual = index.entries.filter((entry) => !isCurrentPath(entry.currentPath));
  if (virtual.length === 0) return;
  const rebuilt = groupLegacyEntries((await scanLegacyRecords(projectRoot)).map(({ entry }) => entry));
  for (const entry of virtual) {
    const source = rebuilt.find((candidate) => candidate.workId === entry.workId);
    if (source === undefined || entryStateSignature(source) !== entryStateSignature(entry)) {
      throw new Error(`Handoff legacy source does not match indexed work ${entry.workId}.`);
    }
  }
}

function entryStateSignature(entry: HandoffIndexEntry): string {
  return JSON.stringify({
    workId: entry.workId,
    revision: entry.revision,
    status: entry.status,
    dedupeKey: entry.dedupeKey,
    currentPath: entry.currentPath,
    legacyRecordIds: entry.legacyRecordIds,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

async function matchedCurrentIsStaleOrInvalid(projectRoot: string, matches: HandoffMatch[]): Promise<boolean> {
  for (const { entry } of matches) {
    if (!isCurrentPath(entry.currentPath)) continue;
    const absolute = resolve(projectRoot, entry.currentPath);
    const markdown = await readTextIfPresent(absolute);
    if (markdown === undefined) return true;
    try {
      const parsed = parseCurrentRecord(projectRoot, absolute, markdown, "current");
      if (
        parsed.entry.revision !== entry.revision
        || parsed.entry.dedupeKey !== entry.dedupeKey
        || parsed.entry.status !== entry.status
      ) return true;
    } catch {
      return true;
    }
  }
  return false;
}

async function storageMayBeNewer(projectRoot: string, indexPath: string): Promise<boolean> {
  const indexStats = await stat(indexPath);
  for (const root of [
    resolve(projectRoot, ".agent", "handoff", "current"),
    resolve(projectRoot, ".agent", "handoff", "history"),
  ]) {
    if (!(await pathExists(root))) continue;
    if ((await newestDirectoryMtime(root)) > indexStats.mtimeMs) return true;
  }
  return false;
}

async function newestDirectoryMtime(directory: string): Promise<number> {
  let newest = (await stat(directory)).mtimeMs;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) newest = Math.max(newest, await newestDirectoryMtime(resolve(directory, entry.name)));
  }
  return newest;
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".md")) result.push(path);
  }
  return result.sort();
}

function scoreRuleEntry(entry: HandoffIndexEntry, prompt: string): HandoffMatch | undefined {
  let score = 0;
  const reasons: string[] = [];
  const add = (weight: number, reason: string): void => {
    score += weight;
    reasons.push(reason);
  };
  if ([entry.workId, ...entry.legacyRecordIds].some((value) => containsBounded(prompt, value))) add(100, "handoff id");
  if (entry.routing.specRefs.some((value) => containsBounded(prompt, value))) add(100, "spec id");
  if (entry.routing.bugIds.some((value) => containsBounded(prompt, value))) add(100, "bug id");
  if (entry.routing.files.some((value) => containsPath(prompt, value))) add(90, "file path");
  if (entry.routing.symbols.some((value) => containsBounded(prompt, value))) add(80, "symbol");
  if (entry.routing.modules.some((value) => containsBounded(prompt, value))) add(60, "module");
  return score === 0 ? undefined : baseMatch(entry, score, reasons);
}

function bm25Match(hit: Bm25Hit): HandoffMatch {
  return {
    ...baseMatch(hit.entry, BM25_MATCH_SCORE, [`bm25 lexical: ${hit.matchedTerms.slice(0, 8).join(", ")}`]),
    lexicalScore: hit.normalizedScore,
    bm25Score: hit.rawScore,
    matchedTerms: hit.matchedTerms,
    termCoverage: hit.termCoverage,
  };
}

function baseMatch(entry: HandoffIndexEntry, score: number, reasons: string[]): HandoffMatch {
  return {
    entry,
    score,
    reasons,
    confidence: reasons.some((reason) => ["handoff id", "spec id", "bug id"].includes(reason))
      ? "exact"
      : score >= 100 ? "high" : "medium",
    records: [recordReference(entry)],
  };
}

function recordReference(entry: HandoffIndexEntry): HandoffRecordReference {
  return {
    workId: entry.workId,
    revision: entry.revision,
    path: entry.currentPath,
    availableSections: entry.availableSections,
    createdAt: entry.updatedAt,
  };
}

function compareMatches(left: HandoffMatch, right: HandoffMatch): number {
  return right.score - left.score
    || (right.lexicalScore ?? 0) - (left.lexicalScore ?? 0)
    || (right.bm25Score ?? 0) - (left.bm25Score ?? 0)
    || statusRank(left.entry.status) - statusRank(right.entry.status)
    || compareEntriesByRecency(left.entry, right.entry);
}

function statusRank(status: HandoffStatus): number {
  return status === "active" || status === "blocked" ? 0 : 1;
}

function compareEntriesByRecency(left: HandoffIndexEntry, right: HandoffIndexEntry): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.workId.localeCompare(left.workId);
}

function compareEntriesAscending(left: HandoffIndexEntry, right: HandoffIndexEntry): number {
  return numericId(left.workId) - numericId(right.workId) || left.workId.localeCompare(right.workId);
}

function compareLegacyEntriesAscending(left: LegacyHandoffIndexEntry, right: LegacyHandoffIndexEntry): number {
  return left.createdAt.localeCompare(right.createdAt) || numericId(left.id) - numericId(right.id);
}

function buildHandoffDedupeKey(input: HandoffInput, cycle: string, status: HandoffStatus): string {
  const sections = Object.fromEntries(
    SECTION_LABELS.map(([key]) => [key, normalizeDedupeText(input.sections[key] ?? "")]),
  );
  const canonical = {
    cycle: normalizeDedupeText(cycle),
    status,
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

function buildLegacyHandoffDedupeKey(input: HandoffInput, cycle: string): string {
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

function routingFromInput(input: HandoffInput): HandoffRouting {
  return {
    specRefs: input.specRefs ?? [],
    bugIds: input.bugIds ?? [],
    modules: input.modules ?? [],
    files: input.files ?? [],
    symbols: input.symbols ?? [],
    tests: input.tests ?? [],
    tags: input.tags ?? [],
    aliases: input.aliases ?? [],
  };
}

function routingFromFields(fields: Map<string, unknown>): HandoffRouting {
  return {
    specRefs: fields.get("spec_refs") as string[],
    bugIds: fields.get("bug_ids") as string[],
    modules: fields.get("modules") as string[],
    files: fields.get("files") as string[],
    symbols: fields.get("symbols") as string[],
    tests: fields.get("tests") as string[],
    tags: fields.get("tags") as string[],
    aliases: (fields.get("aliases") ?? []) as string[],
  };
}

function inputFromEntry(entry: HandoffIndexEntry, sections: HandoffSections): HandoffInput {
  return {
    title: entry.title,
    summary: entry.summary,
    kind: entry.kind,
    sections,
    cycle: entry.cycle,
    specRefs: entry.routing.specRefs,
    modules: entry.routing.modules,
    symbols: entry.routing.symbols,
    files: entry.routing.files,
    bugIds: entry.routing.bugIds,
    tests: entry.routing.tests,
    tags: entry.routing.tags,
    aliases: entry.routing.aliases,
    status: entry.status,
  };
}

function legacyInput(entry: LegacyHandoffIndexEntry, sections: HandoffSections): HandoffInput {
  return {
    title: entry.title,
    summary: entry.summary,
    kind: entry.kind,
    sections,
    cycle: entry.cycle,
    specRefs: entry.routing.specRefs,
    modules: entry.routing.modules,
    symbols: entry.routing.symbols,
    files: entry.routing.files,
    bugIds: entry.routing.bugIds,
    tests: entry.routing.tests,
    tags: entry.routing.tags,
    aliases: entry.routing.aliases,
  };
}

function validateV4Entry(value: unknown): HandoffIndexEntry {
  const stored = validateHandoffIndex({ schemaVersion: 4, entries: [value] });
  if (stored.schemaVersion !== 4 || stored.entries[0] === undefined) throw new Error("Invalid handoff current entry.");
  return stored.entries[0];
}

function validateV4Index(value: unknown): HandoffIndex {
  const stored = validateHandoffIndex(value);
  if (stored.schemaVersion !== 4) throw new Error("Expected handoff index schemaVersion 4.");
  return stored;
}

function sortedIndex(index: HandoffIndex): HandoffIndex {
  return validateV4Index({ schemaVersion: 4, entries: [...index.entries].sort(compareEntriesAscending) });
}

function replaceEntry(index: HandoffIndex, entry: HandoffIndexEntry): void {
  const position = index.entries.findIndex((candidate) => candidate.workId === entry.workId);
  if (position < 0) index.entries.push(entry);
  else index.entries[position] = entry;
}

function successResult(
  action: "created" | "updated",
  entry: HandoffIndexEntry,
  deduplicated: boolean,
  checkpointed: boolean,
  checkpointReason?: string,
): HandoffWriteResult {
  return {
    ok: true,
    action,
    workId: entry.workId,
    revision: entry.revision,
    status: entry.status,
    deduplicated,
    ...(checkpointed ? {
      snapshotPath: historyPath(entry),
      checkpointReason: requiredText(checkpointReason, "checkpointReason"),
    } : {}),
  };
}

function deduplicatedResult(entry: HandoffIndexEntry): HandoffWriteResult {
  return {
    ok: true,
    action: "deduplicated",
    workId: entry.workId,
    revision: entry.revision,
    status: entry.status,
    deduplicated: true,
  };
}

function conflictResult(entry: HandoffIndexEntry, expectedRevision: number): HandoffWriteResult {
  return {
    ok: false,
    action: "conflict",
    workId: entry.workId,
    expectedRevision,
    actualRevision: entry.revision,
    status: entry.status,
  };
}

function availableSections(sections: HandoffSections): string[] {
  return SECTION_LABELS.flatMap(([key]) => sections[key]?.trim() ? [key] : []);
}

function historyPath(entry: Pick<HandoffIndexEntry, "cycle" | "workId" | "revision">): string {
  return `.agent/handoff/history/${entry.cycle}/${entry.workId}/R${String(entry.revision).padStart(4, "0")}.md`;
}

function inferCurrentPathFromCheckpoint(fields: Map<string, unknown>): string {
  const cycle = requiredText(fields.get("cycle"), "cycle");
  const workId = normalizeWorkId(fields.get("work_id"));
  const title = requiredText(fields.get("title"), "title");
  return `.agent/handoff/current/${cycle}/${workId}-${slugify(title)}.md`;
}

function isCurrentPath(path: string): boolean {
  return path.replaceAll("\\", "/").startsWith(".agent/handoff/current/");
}

function isCheckpointInput(input: HandoffWriteInput): input is HandoffCheckpointInput {
  return isRecord(input) && input.checkpointOnly === true;
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

function canonicalList(values: string[] | undefined): string[] {
  return [...(values ?? [])].map(normalizeDedupeText).filter(Boolean).sort();
}

function normalizeDedupeText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/gu, " ").trim();
}

function nextHandoffId(entries: HandoffIndexEntry[]): string {
  const maximum = entries.reduce((current, entry) => Math.max(
    current,
    numericId(entry.workId),
    ...entry.legacyRecordIds.map(numericId),
  ), 0);
  return `W${String(maximum + 1).padStart(3, "0")}`;
}

function numericId(value: string): number {
  const match = /^W(\d+)$/u.exec(value);
  return match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
}

function normalizeWorkId(value: unknown): string {
  const workId = requiredText(value, "workId").normalize("NFKC").toLocaleUpperCase();
  if (!/^W[0-9]+$/u.test(workId)) throw new Error("Handoff workId must use the W<number> form.");
  return workId;
}

function requiredRevision(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Handoff ${field} must be a positive integer.`);
  }
  return value as number;
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
  const sanitized = value.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return sanitized || fallback;
}

function slugify(value: string): string {
  return sanitizeSegment(value.toLocaleLowerCase(), "handoff").slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
