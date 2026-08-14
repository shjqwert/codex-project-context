import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  NotebookLmDocumentType,
  NotebookLmLibraryManifest,
  NotebookLmLibraryManifestEntry,
} from "../types.js";
import {
  assertDirectory,
  readJsonIfPresent,
  writeJsonAtomic,
} from "../infrastructure/files.js";

export const NOTEBOOKLM_LIBRARY_MANIFEST = ".notebooklm-upload-manifest.json";
const MAX_PDF_FILES = 10_000;
const MAX_SCAN_DEPTH = 20;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export interface NotebookLmLibraryFile {
  path: string;
  sha256: string;
  size: number;
  modifiedAt: string;
}

export async function inspectNotebookLmLibrary(rootDirectory: string): Promise<Record<string, unknown>> {
  const root = resolve(rootDirectory);
  await assertDirectory(root);
  const files: NotebookLmLibraryFile[] = [];
  await scanPdfFiles(root, root, 0, files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifestStatus = await readManifestStatus(root);
  return {
    ok: true,
    action: "inspected",
    root,
    manifestPath: resolve(root, NOTEBOOKLM_LIBRARY_MANIFEST),
    manifestState: manifestStatus.state,
    ...(manifestStatus.error === undefined ? {} : { manifestError: manifestStatus.error }),
    fileCount: files.length,
    files,
  };
}

export async function updateNotebookLmLibraryManifest(
  rootDirectory: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const root = resolve(rootDirectory);
  await assertDirectory(root);
  const manifest = await validateNotebookLmLibraryManifest(root, value);
  const manifestPath = resolve(root, NOTEBOOKLM_LIBRARY_MANIFEST);
  await writeJsonAtomic(manifestPath, manifest);
  return {
    ok: true,
    action: "updated",
    root,
    manifestPath,
    fileCount: manifest.files.length,
    publicNotebook: manifest.publicNotebook,
  };
}

export async function validateNotebookLmLibraryManifest(
  root: string,
  value: unknown,
): Promise<NotebookLmLibraryManifest> {
  const record = requireRecord(value, "NotebookLM library manifest");
  requireExactKeys(record, ["schemaVersion", "publicNotebook", "files"], "NotebookLM library manifest");
  if (record.schemaVersion !== 1) throw new Error("NotebookLM library manifest schemaVersion must be 1.");
  const publicNotebookRecord = requireRecord(record.publicNotebook, "publicNotebook");
  requireExactKeys(publicNotebookRecord, ["id", "title"], "publicNotebook");
  const publicNotebook = {
    id: requiredText(publicNotebookRecord.id, "publicNotebook.id"),
    title: requiredText(publicNotebookRecord.title, "publicNotebook.title"),
  };
  const files = requireArray(record.files, "files").map((entry, index) =>
    validateManifestEntry(root, entry, index),
  ).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    throw new Error("NotebookLM library manifest file paths must be unique.");
  }
  await Promise.all(files.map((entry) => reconcileManifestEntry(root, entry)));
  return { schemaVersion: 1, publicNotebook, files };
}

async function scanPdfFiles(
  root: string,
  directory: string,
  depth: number,
  files: NotebookLmLibraryFile[],
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) throw new Error(`NotebookLM PDF scan exceeds depth limit ${MAX_SCAN_DEPTH}.`);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await scanPdfFiles(root, absolute, depth + 1, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLocaleLowerCase().endsWith(".pdf")) continue;
    if (files.length >= MAX_PDF_FILES) {
      throw new Error(`NotebookLM PDF scan exceeds file limit ${MAX_PDF_FILES}.`);
    }
    const details = await stat(absolute);
    files.push({
      path: relative(root, absolute).replaceAll("\\", "/"),
      sha256: await hashFile(absolute),
      size: details.size,
      modifiedAt: details.mtime.toISOString(),
    });
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return `sha256:${hash.digest("hex")}`;
}

async function readManifestStatus(
  root: string,
): Promise<{ state: "absent" | "valid" | "invalid"; error?: string }> {
  try {
    const value = await readJsonIfPresent<unknown>(resolve(root, NOTEBOOKLM_LIBRARY_MANIFEST));
    if (value === undefined) return { state: "absent" };
    await validateNotebookLmLibraryManifest(root, value);
    return { state: "valid" };
  } catch (error) {
    return { state: "invalid", error: error instanceof Error ? error.message : String(error) };
  }
}

function validateManifestEntry(
  root: string,
  value: unknown,
  index: number,
): NotebookLmLibraryManifestEntry {
  const field = `files[${index}]`;
  const record = requireRecord(value, field);
  requireExactKeys(record, [
    "path",
    "sha256",
    "size",
    "modifiedAt",
    "category",
    "documentType",
    "partNumbers",
    "confidence",
    "status",
    "manufacturer",
    "documentNumber",
    "revision",
    "publishedAt",
    "sourceId",
    "sourceTitle",
    "lastAttemptAt",
  ], field);
  const path = libraryRelativePdfPath(root, record.path, `${field}.path`);
  const sha256 = requiredText(record.sha256, `${field}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`${field}.sha256 is invalid.`);
  if (!Number.isSafeInteger(record.size) || (record.size as number) < 0) {
    throw new Error(`${field}.size must be a non-negative safe integer.`);
  }
  const categories = new Set(["mcu", "driver", "mos", "other-ic"]);
  if (typeof record.category !== "string" || !categories.has(record.category)) {
    throw new Error(`${field}.category is invalid.`);
  }
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
  if (record.confidence !== "high" && record.confidence !== "medium" && record.confidence !== "low") {
    throw new Error(`${field}.confidence is invalid.`);
  }
  const statuses = new Set(["pending", "ready", "failed", "ambiguous", "duplicate", "superseded"]);
  if (typeof record.status !== "string" || !statuses.has(record.status)) {
    throw new Error(`${field}.status is invalid.`);
  }
  const result: NotebookLmLibraryManifestEntry = {
    path,
    sha256,
    size: record.size as number,
    modifiedAt: timestamp(record.modifiedAt, `${field}.modifiedAt`),
    category: record.category as NotebookLmLibraryManifestEntry["category"],
    documentType: record.documentType as NotebookLmDocumentType,
    partNumbers: stringArray(record.partNumbers, `${field}.partNumbers`),
    confidence: record.confidence as NotebookLmLibraryManifestEntry["confidence"],
    status: record.status as NotebookLmLibraryManifestEntry["status"],
    ...optionalTextFields(record, field),
    ...(record.publishedAt === undefined ? {} : { publishedAt: timestamp(record.publishedAt, `${field}.publishedAt`) }),
    ...(record.lastAttemptAt === undefined ? {} : { lastAttemptAt: timestamp(record.lastAttemptAt, `${field}.lastAttemptAt`) }),
  };
  if ((result.status === "ready" || result.status === "duplicate" || result.status === "superseded")
      && (result.sourceId === undefined || result.sourceTitle === undefined)) {
    throw new Error(`${field}.${result.status} status requires sourceId and sourceTitle.`);
  }
  return result;
}

async function reconcileManifestEntry(
  root: string,
  entry: NotebookLmLibraryManifestEntry,
): Promise<void> {
  const absolute = resolve(root, entry.path);
  const details = await lstat(absolute).catch(() => undefined);
  if (details === undefined || details.isSymbolicLink() || !details.isFile()) {
    throw new Error(`NotebookLM manifest path must be a regular non-symlink PDF: ${entry.path}`);
  }
  if (details.size !== entry.size) {
    throw new Error(`NotebookLM manifest size is stale: ${entry.path}`);
  }
  if (details.mtime.toISOString() !== entry.modifiedAt) {
    throw new Error(`NotebookLM manifest modifiedAt is stale: ${entry.path}`);
  }
  if (await hashFile(absolute) !== entry.sha256) {
    throw new Error(`NotebookLM manifest sha256 is stale: ${entry.path}`);
  }
}

function optionalTextFields(
  record: Record<string, unknown>,
  field: string,
): Partial<NotebookLmLibraryManifestEntry> {
  const result: Partial<NotebookLmLibraryManifestEntry> = {};
  for (const key of ["manufacturer", "documentNumber", "revision", "sourceId", "sourceTitle"] as const) {
    if (record[key] !== undefined) result[key] = requiredText(record[key], `${field}.${key}`);
  }
  return result;
}

function libraryRelativePdfPath(root: string, value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || isAbsolute(value)) {
    throw new Error(`${field} must be a relative PDF path.`);
  }
  const absolute = resolve(root, value);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolute === root || !absolute.startsWith(rootPrefix)) throw new Error(`${field} escapes the PDF root.`);
  const normalized = relative(root, absolute).replaceAll("\\", "/");
  if (normalized !== value.replaceAll("\\", "/") || !normalized.toLocaleLowerCase().endsWith(".pdf")) {
    throw new Error(`${field} must be a normalized PDF path.`);
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
  const values = requireArray(value, field).map((item, index) => requiredText(item, `${field}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${field} must contain unique values.`);
  return values;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function timestamp(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!ISO_TIMESTAMP_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return text;
}
