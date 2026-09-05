import { lstat, open, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CHANGE_ID_PATTERN } from "./change-links.js";

const STATUSES = ["planning", "ready", "in-progress", "blocked", "verified", "closed"] as const;
export interface ProjectChangeSummary {
  id: string;
  title: string;
  status: typeof STATUSES[number];
  planId?: string;
  path: string;
  archived: boolean;
}

/** Read native proposals only. This query never creates or repairs project state. */
export async function listProjectChanges(projectRoot: string): Promise<{
  changes: ProjectChangeSummary[];
  warnings: string[];
}> {
  const changes: ProjectChangeSummary[] = [];
  const warnings: string[] = [];
  const base = "openspec/changes";
  for (const path of ["openspec", base]) {
    if (!(await directory(path))) return { changes, warnings };
  }
  for (const entry of await children(base)) {
    if (entry.isSymbolicLink()) { warnings.push("Skipped linked change: " + entry.name); continue; }
    if (!entry.isDirectory()) continue;
    if (entry.name === "archive") {
      for (const archived of await children(base + "/archive")) {
        if (archived.isSymbolicLink()) { warnings.push("Skipped linked archive: " + archived.name); continue; }
        if (!archived.isDirectory()) continue;
        const match = /^\d{4}-\d{2}-\d{2}-(.+)$/u.exec(archived.name);
        if (match?.[1] === undefined) { warnings.push("Unrecognized archive name: " + archived.name); continue; }
        await readProposal(base + "/archive/" + archived.name, match[1], true);
      }
    } else {
      await readProposal(base + "/" + entry.name, entry.name, false);
    }
  }
  const counts = new Map<string, number>();
  for (const change of changes) counts.set(change.id, (counts.get(change.id) ?? 0) + 1);
  for (const [id, count] of counts) if (count > 1) warnings.push("Duplicate Change ID; inspect before use: " + id);
  return { changes: changes.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path)), warnings };

  async function children(path: string) {
    try { return await readdir(resolve(projectRoot, path), { withFileTypes: true }); }
    catch { warnings.push("Cannot list directory: " + path); return []; }
  }

  async function directory(path: string): Promise<boolean> {
    try {
      const details = await lstat(resolve(projectRoot, path));
      if (!details.isDirectory() || details.isSymbolicLink()) {
        warnings.push("Expected a local directory: " + path);
        return false;
      }
      return true;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) warnings.push("Cannot read directory: " + path);
      return false;
    }
  }

  async function readProposal(directory: string, id: string, archived: boolean): Promise<void> {
    const path = directory + "/proposal.md";
    if (!CHANGE_ID_PATTERN.test(id)) { warnings.push("Invalid Change ID: " + path); return; }
    try {
      const absolutePath = resolve(projectRoot, path);
      const details = await lstat(absolutePath);
      if (!details.isFile() || details.isSymbolicLink()) throw new Error("Expected a local proposal");
      const handle = await open(absolutePath, "r");
      let content: string;
      try {
        const buffer = Buffer.alloc(128 * 1024 + 1);
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
          if (result.bytesRead === 0) break;
          bytesRead += result.bytesRead;
        }
        if (bytesRead === buffer.length) throw new Error("Proposal exceeds query limit");
        content = buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await handle.close();
      }
      const lines = unfencedLines(content);
      const headings = lines.flatMap((line, index) => /^## Change Context\s*$/u.test(line) ? [index] : []);
      const start = headings[0];
      if (headings.length !== 1 || start === undefined) throw new Error("Expected one Change Context");
      const tail = lines.slice(start + 1);
      const nextHeading = tail.findIndex((line) => /^#{1,2}\s/u.test(line));
      const context = (nextHeading < 0 ? tail : tail.slice(0, nextHeading)).join("\n");
      const statuses = [...context.matchAll(/^- status: ([^\r\n]+)$/gmu)];
      const plans = [...context.matchAll(/^- planId: ([^\r\n]+)$/gmu)];
      const status = statuses[0]?.[1]?.trim();
      const planId = plans[0]?.[1]?.trim();
      if (statuses.length !== 1 || !STATUSES.includes(status as typeof STATUSES[number])
        || plans.length > 1 || (planId !== undefined && !/^P[0-9]+$/u.test(planId))) {
        throw new Error("Invalid Change Context");
      }
      if (archived && status !== "closed") warnings.push("Archived Change is not closed: " + path);
      changes.push({
        id, title: lines.find((line) => /^# [^#]/u.test(line))?.slice(2).trim() || id,
        status: status as typeof STATUSES[number], path, archived,
        ...(planId === undefined ? {} : { planId }),
      });
    } catch {
      warnings.push("Could not read a valid Change Context: " + path);
    }
  }
}

function unfencedLines(content: string): string[] {
  let fence: string | undefined;
  return content.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      return false;
    }
    return fence === undefined;
  });
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
