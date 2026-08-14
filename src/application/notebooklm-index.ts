import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  NotebookLmComponentBinding,
  NotebookLmDocumentType,
  NotebookLmExperienceNoteBinding,
  NotebookLmNotebookBinding,
  NotebookLmProjectIndex,
  NotebookLmSourceBinding,
} from "../types.js";
import {
  pathExists,
  readJsonIfPresent,
  readTextIfPresent,
  removeFileIfPresent,
  writeJsonAtomic,
  writeTextAtomic,
} from "../infrastructure/files.js";

export const NOTEBOOKLM_INDEX_PATH = ".agent/notebooklm-index.json";
const INDEX_EXCLUDE_PATTERN = `/${NOTEBOOKLM_INDEX_PATH}`;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export type NotebookLmIndexState = "unconfigured" | "enabled" | "disabled" | "invalid";

export interface NotebookLmIndexStatus {
  state: NotebookLmIndexState;
  path: string;
  mode: NotebookLmProjectIndex["mode"] | null;
  notebookCount: number;
  componentCount: number;
  noteCount: number;
  schematicChanged?: boolean;
  currentSchematicSha256?: string;
  error?: string;
  index?: NotebookLmProjectIndex;
}

export async function readNotebookLmIndexStatus(projectRoot: string): Promise<NotebookLmIndexStatus> {
  const indexPath = resolve(projectRoot, NOTEBOOKLM_INDEX_PATH);
  try {
    const raw = await readJsonIfPresent<unknown>(indexPath);
    if (raw === undefined) return emptyStatus("unconfigured");
    const index = await validateNotebookLmProjectIndex(projectRoot, raw);
    const currentSchematicSha256 = index.schematic === undefined
      ? undefined
      : await hashFile(resolve(projectRoot, index.schematic.path));
    return {
      state: index.mode === "disabled" ? "disabled" : "enabled",
      path: NOTEBOOKLM_INDEX_PATH,
      mode: index.mode,
      notebookCount: index.notebooks.length,
      componentCount: index.components.length,
      noteCount: index.notes.length,
      ...(index.schematic === undefined || currentSchematicSha256 === undefined ? {} : {
        schematicChanged: currentSchematicSha256 !== index.schematic.sha256,
        currentSchematicSha256,
      }),
      index,
    };
  } catch (error) {
    return {
      ...emptyStatus("invalid"),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function requireValidNotebookLmIndexStatus(
  projectRoot: string,
): Promise<NotebookLmIndexStatus> {
  const status = await readNotebookLmIndexStatus(projectRoot);
  if (status.state === "invalid") {
    throw new Error(`Invalid NotebookLM project index: ${status.error ?? "unknown validation error"}`);
  }
  return status;
}

export async function validateNotebookLmProjectIndex(
  projectRoot: string,
  value: unknown,
  options: { verifySchematicHash?: boolean } = {},
): Promise<NotebookLmProjectIndex> {
  const record = requireRecord(value, "NotebookLM project index");
  requireExactKeys(record, [
    "schemaVersion",
    "mode",
    "notebooks",
    "components",
    "notes",
    "advisories",
    "schematic",
    "lastRefreshedAt",
  ], "NotebookLM project index");
  if (record.schemaVersion !== 1) throw new Error("NotebookLM project index schemaVersion must be 1.");
  if (record.mode !== "schematic" && record.mode !== "manual" && record.mode !== "disabled") {
    throw new Error("NotebookLM project index mode must be schematic, manual, or disabled.");
  }

  const notebooks = requireArray(record.notebooks, "notebooks").map(validateNotebook);
  requireUnique(notebooks.map(({ id }) => id), "NotebookLM notebook ids");
  requireUnique(notebooks.map(({ scope }) => scope), "NotebookLM notebook scopes");
  if (record.mode !== "disabled" && notebooks.length === 0) {
    throw new Error("Enabled NotebookLM project index requires at least one notebook binding.");
  }
  const notebookIds = new Set(notebooks.map(({ id }) => id));
  const components = requireArray(record.components, "components").map((entry, index) =>
    validateComponent(entry, index, notebookIds),
  );
  const notes = requireArray(record.notes, "notes").map((entry, index) =>
    validateNote(entry, index, notebookIds),
  );
  const advisories = stringArray(record.advisories, "advisories");
  const schematic = record.schematic === undefined
    ? undefined
    : await validateSchematic(projectRoot, record.schematic, options.verifySchematicHash === true);
  if (record.mode === "schematic" && schematic === undefined) {
    throw new Error("NotebookLM schematic mode requires a schematic PDF binding.");
  }
  if (record.mode !== "schematic" && schematic !== undefined) {
    throw new Error("Only NotebookLM schematic mode may contain a schematic binding.");
  }
  const lastRefreshedAt = optionalTimestamp(record.lastRefreshedAt, "lastRefreshedAt");

  return {
    schemaVersion: 1,
    mode: record.mode,
    notebooks,
    components,
    notes,
    advisories,
    ...(schematic === undefined ? {} : { schematic }),
    ...(lastRefreshedAt === undefined ? {} : { lastRefreshedAt }),
  };
}

export async function writeNotebookLmProjectIndex(
  projectRoot: string,
  index: NotebookLmProjectIndex,
): Promise<string> {
  const indexPath = resolve(projectRoot, NOTEBOOKLM_INDEX_PATH);
  await writeJsonAtomic(indexPath, index);
  return indexPath;
}

export interface NotebookLmExcludeSnapshot {
  path?: string;
  previous?: string;
  existed?: boolean;
  changed: boolean;
}

export async function ensureNotebookLmIndexExcluded(
  projectRoot: string,
): Promise<NotebookLmExcludeSnapshot> {
  const gitDirectory = await resolveGitDirectory(projectRoot);
  if (gitDirectory === undefined) return { changed: false };
  const excludePath = resolve(gitDirectory, "info", "exclude");
  const previous = await readTextIfPresent(excludePath);
  const current = previous ?? "";
  const lines = current.split(/\r?\n/u).map((line) => line.trim());
  if (lines.includes(INDEX_EXCLUDE_PATTERN) || lines.includes(NOTEBOOKLM_INDEX_PATH)) {
    return { path: excludePath, previous: current, existed: previous !== undefined, changed: false };
  }
  const lineBreak = current.includes("\r\n") ? "\r\n" : "\n";
  const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}${lineBreak}`;
  await writeTextAtomic(excludePath, `${prefix}${INDEX_EXCLUDE_PATTERN}${lineBreak}`);
  return { path: excludePath, previous: current, existed: previous !== undefined, changed: true };
}

export async function restoreNotebookLmIndexExclusion(snapshot: NotebookLmExcludeSnapshot): Promise<void> {
  if (!snapshot.changed || snapshot.path === undefined) return;
  if (snapshot.existed === false) {
    await removeFileIfPresent(snapshot.path);
    return;
  }
  if (snapshot.previous !== undefined) await writeTextAtomic(snapshot.path, snapshot.previous);
}

async function validateSchematic(
  projectRoot: string,
  value: unknown,
  verifyHash: boolean,
): Promise<NotebookLmProjectIndex["schematic"]> {
  const record = requireRecord(value, "schematic");
  requireExactKeys(record, ["path", "sha256"], "schematic");
  const path = projectRelativePath(projectRoot, record.path, "schematic path");
  if (!path.toLocaleLowerCase().endsWith(".pdf")) {
    throw new Error("NotebookLM schematic path must name a PDF file.");
  }
  const absolute = resolve(projectRoot, path);
  const details = await stat(absolute).catch(() => undefined);
  if (details === undefined || !details.isFile()) {
    throw new Error(`NotebookLM schematic PDF does not exist: ${path}`);
  }
  const sha256 = requiredText(record.sha256, "schematic sha256");
  if (!SHA256_PATTERN.test(sha256)) throw new Error("NotebookLM schematic sha256 is invalid.");
  if (verifyHash && await hashFile(absolute) !== sha256) {
    throw new Error("NotebookLM schematic sha256 does not match the selected PDF.");
  }
  return { path, sha256 };
}

function validateNotebook(value: unknown, index: number): NotebookLmNotebookBinding {
  const record = requireRecord(value, `notebooks[${index}]`);
  requireExactKeys(record, ["scope", "id", "title"], `notebooks[${index}]`);
  if (record.scope !== "project" && record.scope !== "public") {
    throw new Error(`notebooks[${index}].scope must be project or public.`);
  }
  return {
    scope: record.scope,
    id: requiredText(record.id, `notebooks[${index}].id`),
    title: requiredText(record.title, `notebooks[${index}].title`),
  };
}

function validateComponent(
  value: unknown,
  index: number,
  notebookIds: Set<string>,
): NotebookLmComponentBinding {
  const field = `components[${index}]`;
  const record = requireRecord(value, field);
  requireExactKeys(record, [
    "refdes",
    "partNumber",
    "category",
    "page",
    "confidence",
    "package",
    "sources",
  ], field);
  const categories = new Set(["mcu", "driver", "power", "communication", "sensor", "mos", "other"]);
  if (typeof record.category !== "string" || !categories.has(record.category)) {
    throw new Error(`${field}.category is invalid.`);
  }
  if (!Number.isInteger(record.page) || (record.page as number) < 1) {
    throw new Error(`${field}.page must be a positive integer.`);
  }
  if (record.confidence !== "high" && record.confidence !== "medium" && record.confidence !== "low") {
    throw new Error(`${field}.confidence is invalid.`);
  }
  const sources = requireArray(record.sources, `${field}.sources`).map((entry, sourceIndex) =>
    validateSource(entry, `${field}.sources[${sourceIndex}]`, notebookIds),
  );
  return {
    refdes: requiredText(record.refdes, `${field}.refdes`),
    partNumber: requiredText(record.partNumber, `${field}.partNumber`),
    category: record.category as NotebookLmComponentBinding["category"],
    page: record.page as number,
    confidence: record.confidence,
    ...(record.package === undefined ? {} : { package: requiredText(record.package, `${field}.package`) }),
    sources,
  };
}

function validateSource(
  value: unknown,
  field: string,
  notebookIds: Set<string>,
): NotebookLmSourceBinding {
  const record = requireRecord(value, field);
  requireExactKeys(record, ["notebookId", "sourceId", "title", "documentType", "status", "version"], field);
  const notebookId = requiredText(record.notebookId, `${field}.notebookId`);
  if (!notebookIds.has(notebookId)) throw new Error(`${field}.notebookId is not bound by this project.`);
  const documentTypes = new Set<NotebookLmDocumentType>([
    "datasheet",
    "reference-manual",
    "errata",
    "application-note",
    "hardware-design-guide",
    "other",
  ]);
  if (typeof record.documentType !== "string" || !documentTypes.has(record.documentType as NotebookLmDocumentType)) {
    throw new Error(`${field}.documentType is invalid.`);
  }
  const statuses = new Set(["ready", "processing", "error", "missing", "unverified"]);
  if (typeof record.status !== "string" || !statuses.has(record.status)) {
    throw new Error(`${field}.status is invalid.`);
  }
  return {
    notebookId,
    sourceId: requiredText(record.sourceId, `${field}.sourceId`),
    title: requiredText(record.title, `${field}.title`),
    documentType: record.documentType as NotebookLmDocumentType,
    status: record.status as NotebookLmSourceBinding["status"],
    ...(record.version === undefined ? {} : { version: requiredText(record.version, `${field}.version`) }),
  };
}

function validateNote(
  value: unknown,
  index: number,
  notebookIds: Set<string>,
): NotebookLmExperienceNoteBinding {
  const field = `notes[${index}]`;
  const record = requireRecord(value, field);
  requireExactKeys(record, ["notebookId", "noteId", "title", "subject", "status"], field);
  const notebookId = requiredText(record.notebookId, `${field}.notebookId`);
  if (!notebookIds.has(notebookId)) throw new Error(`${field}.notebookId is not bound by this project.`);
  if (record.status !== "verified" && record.status !== "provisional") {
    throw new Error(`${field}.status must be verified or provisional.`);
  }
  return {
    notebookId,
    noteId: requiredText(record.noteId, `${field}.noteId`),
    title: requiredText(record.title, `${field}.title`),
    subject: requiredText(record.subject, `${field}.subject`),
    status: record.status,
  };
}

async function resolveGitDirectory(projectRoot: string): Promise<string | undefined> {
  const marker = resolve(projectRoot, ".git");
  if (!await pathExists(marker)) return undefined;
  const details = await stat(marker);
  if (details.isDirectory()) return marker;
  if (!details.isFile()) return undefined;
  const text = await readTextIfPresent(marker);
  const match = text?.match(/^gitdir:\s*(.+)\s*$/iu);
  if (match?.[1] === undefined) return undefined;
  return resolve(projectRoot, match[1]);
}

function emptyStatus(state: NotebookLmIndexState): NotebookLmIndexStatus {
  return {
    state,
    path: NOTEBOOKLM_INDEX_PATH,
    mode: null,
    notebookCount: 0,
    componentCount: 0,
    noteCount: 0,
  };
}

function projectRelativePath(projectRoot: string, value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || isAbsolute(value)) {
    throw new Error(`${field} must be a non-empty project-relative path.`);
  }
  const absolute = resolve(projectRoot, value);
  const rootPrefix = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;
  if (absolute === projectRoot || !absolute.startsWith(rootPrefix)) {
    throw new Error(`${field} must stay inside the project root.`);
  }
  const normalized = relative(projectRoot, absolute).replaceAll("\\", "/");
  if (normalized !== value.replaceAll("\\", "/")) {
    throw new Error(`${field} must be normalized.`);
  }
  return normalized;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, allowed: string[], field: string): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedKeys.has(key));
  if (unknown !== undefined) throw new Error(`${field} contains unknown field: ${unknown}.`);
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((item, index) => requiredText(item, `${field}[${index}]`));
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requiredText(value, field);
  if (!ISO_TIMESTAMP_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return text;
}

function requireUnique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} must be unique.`);
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return `sha256:${hash.digest("hex")}`;
}
