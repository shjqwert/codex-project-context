import type { HandoffLinks } from "../types.js";

export const CHANGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function normalizeHandoffLinks(value: {
  planIds?: unknown;
  changeIds?: unknown;
  taskRefs?: unknown;
}): HandoffLinks {
  const planIds = identifiers(value.planIds, /^P[0-9]+$/u, "planIds");
  const changeIds = identifiers(value.changeIds, CHANGE_ID_PATTERN, "changeIds");
  const result: HandoffLinks = {};
  if (planIds.length > 0) result.planIds = planIds;
  if (changeIds.length > 0) result.changeIds = changeIds;
  if (value.taskRefs !== undefined) {
    if (!Array.isArray(value.taskRefs)) throw new Error("Handoff taskRefs must be an array.");
    const unique = new Map<string, { changeId: string; taskId: string }>();
    for (const ref of value.taskRefs) {
      if (typeof ref !== "object" || ref === null || Array.isArray(ref)
        || Object.keys(ref).some((key) => key !== "changeId" && key !== "taskId")
        || typeof ref.changeId !== "string" || !CHANGE_ID_PATTERN.test(ref.changeId)
        || typeof ref.taskId !== "string" || !/^T[0-9]+$/u.test(ref.taskId)) {
        throw new Error("Handoff taskRefs require a changeId and a T<number> taskId.");
      }
      unique.set(ref.changeId + "/" + ref.taskId, { changeId: ref.changeId, taskId: ref.taskId });
    }
    if (unique.size > 0) result.taskRefs = [...unique.entries()]
      .sort(([left], [right]) => left.localeCompare(right)).map(([, ref]) => ref);
  }
  // Absent/empty links stay absent, preserving old record serialization and hashes.
  return result;
}

function identifiers(value: unknown, pattern: RegExp, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !pattern.test(item))) {
    throw new Error("Handoff " + field + " contains an invalid identifier.");
  }
  return [...new Set(value as string[])].sort();
}
