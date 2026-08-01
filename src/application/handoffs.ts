import { dirname, resolve } from "node:path";
import type {
  HandoffIndex,
  HandoffIndexEntry,
  HandoffInput,
  HandoffMatch,
  HandoffSections,
} from "../types.js";
import { ensureDirectory, readJson, writeJsonAtomic, writeTextAtomic } from "../infrastructure/files.js";
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

export async function createHandoff(
  projectDirectory: string,
  rawInput: HandoffInput,
): Promise<{ ok: true; id: string; path: string; projectRoot: string }> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const indexPath = resolve(projectRoot, context.handoffIndex);
  const index = await readJson<HandoffIndex>(indexPath);
  validateIndex(index);

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
  limit = 3,
): Promise<HandoffMatch[]> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const context = await readProjectContext(projectRoot);
  const index = await readJson<HandoffIndex>(resolve(projectRoot, context.handoffIndex));
  validateIndex(index);

  const normalizedPrompt = prompt.toLocaleLowerCase();
  return index.entries
    .map((entry) => scoreEntry(entry, normalizedPrompt))
    .filter((result): result is HandoffMatch => result !== undefined && result.score >= 20)
    .sort((left, right) => right.score - left.score || right.entry.createdAt.localeCompare(left.entry.createdAt))
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
  const sections = SECTION_LABELS.filter(([key]) => input.sections?.[key]?.trim()).map(([, label]) => label);
  return {
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
    sections,
    path,
    createdAt,
  };
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

  if (contains(prompt, entry.id) || entry.specRefs.some((value) => contains(prompt, value)) || entry.bugIds.some((value) => contains(prompt, value))) {
    add(100, "exact id");
  }
  if (entry.files.some((value) => contains(prompt, value))) add(90, "file path");
  if (entry.symbols.some((value) => contains(prompt, value))) add(80, "symbol");
  if (entry.modules.some((value) => contains(prompt, value))) add(60, "module");
  if (entry.testNames.some((value) => contains(prompt, value))) add(50, "test name");
  if (textMatches(prompt, entry.title)) add(40, "title");
  if (textMatches(prompt, entry.summary) || entry.tags.some((value) => contains(prompt, value))) add(20, "summary or tag");

  return score === 0 ? undefined : { entry, score, reasons };
}

function textMatches(prompt: string, text: string): boolean {
  const normalized = text.toLocaleLowerCase().trim();
  if (normalized.length >= 4 && prompt.includes(normalized)) return true;
  return normalized.split(/[^\p{L}\p{N}_-]+/u).some((token) => token.length >= 4 && prompt.includes(token));
}

function contains(prompt: string, value: string): boolean {
  const normalized = value.toLocaleLowerCase().trim().replaceAll("\\", "/");
  return normalized.length > 0 && prompt.replaceAll("\\", "/").includes(normalized);
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

function validateIndex(index: HandoffIndex): void {
  if (index.schemaVersion !== 1 || !Array.isArray(index.entries)) {
    throw new Error("Unsupported or invalid handoff index.");
  }
}
