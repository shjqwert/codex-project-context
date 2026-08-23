import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type {
  ProjectPlan,
  ProjectPlanDocument,
  ProjectPlanInput,
  ProjectPlanStatus,
} from "../types.js";
import { readTextIfPresent, writeTextAtomic } from "../infrastructure/files.js";
import { withProjectWriteLock } from "../infrastructure/project-write-lock.js";
import { requireProjectRoot } from "./project-context.js";

const DATA_START = "<!-- PROJECT_PLAN_DATA_START -->";
const DATA_END = "<!-- PROJECT_PLAN_DATA_END -->";
const EMPTY_DOCUMENT: ProjectPlanDocument = { schemaVersion: 1, plans: [] };
const STATUSES: ProjectPlanStatus[] = [
  "proposed",
  "accepted",
  "in-progress",
  "completed",
  "rejected",
  "superseded",
];
const ALLOWED_TRANSITIONS: Record<ProjectPlanStatus, ProjectPlanStatus[]> = {
  proposed: ["accepted", "rejected"],
  accepted: ["in-progress", "rejected", "superseded"],
  "in-progress": ["completed", "rejected", "superseded"],
  completed: [],
  rejected: [],
  superseded: [],
};

export async function createProjectPlan(
  projectDirectory: string,
  rawInput: ProjectPlanInput,
): Promise<{
  ok: true;
  id: string;
  status: ProjectPlanStatus;
  path: string;
  projectRoot: string;
  deduplicated: boolean;
}> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const planPath = resolve(projectRoot, ".agent", "planMsg.md");
    const document = await readPlanDocument(planPath);
    const input = normalizeInput(rawInput);
    const dedupeKey = buildPlanDedupeKey(input);
    const duplicate = document.plans.find((plan) => plan.dedupeKey === dedupeKey);
    if (duplicate !== undefined) {
      return {
        ok: true,
        id: duplicate.id,
        status: duplicate.status,
        path: planPath,
        projectRoot,
        deduplicated: true,
      };
    }

    const id = nextPlanId(document.plans);
    const now = new Date().toISOString();
    const plan: ProjectPlan = {
      id,
      title: input.title,
      summary: input.summary,
      status: "proposed",
      successCriteria: input.successCriteria ?? [],
      specRefs: input.specRefs ?? [],
      decisions: input.decisions ?? [],
      dedupeKey,
      createdAt: now,
      updatedAt: now,
      transitions: [{ from: null, to: "proposed", reason: "Plan recorded.", at: now }],
    };

    document.plans.push(plan);
    await writeTextAtomic(planPath, renderPlanDocument(document));
    return { ok: true, id, status: plan.status, path: planPath, projectRoot, deduplicated: false };
  });
}

export async function transitionProjectPlan(
  projectDirectory: string,
  id: string,
  requestedStatus: string,
  reason: string,
): Promise<{ ok: true; id: string; status: ProjectPlanStatus; path: string; projectRoot: string }> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  return withProjectWriteLock(projectRoot, async () => {
    const planPath = resolve(projectRoot, ".agent", "planMsg.md");
    const document = await readPlanDocument(planPath);
    const normalizedId = requiredText(id, "id").toLocaleUpperCase();
    const plan = document.plans.find((candidate) => candidate.id === normalizedId);
    if (plan === undefined) throw new Error(`Project plan ${normalizedId} was not found.`);

    const nextStatus = parseStatus(requestedStatus);
    const transitionReason = requiredText(reason, "transition reason");
    if (!ALLOWED_TRANSITIONS[plan.status].includes(nextStatus)) {
      throw new Error(`Invalid project plan transition: ${plan.status} -> ${nextStatus}.`);
    }

    const now = new Date().toISOString();
    const previousStatus = plan.status;
    plan.status = nextStatus;
    plan.updatedAt = now;
    plan.transitions.push({ from: previousStatus, to: nextStatus, reason: transitionReason, at: now });
    await writeTextAtomic(planPath, renderPlanDocument(document));
    return { ok: true, id: plan.id, status: plan.status, path: planPath, projectRoot };
  });
}

export async function listProjectPlans(
  projectDirectory: string,
): Promise<{ ok: true; path: string; projectRoot: string; plans: ProjectPlan[] }> {
  const projectRoot = await requireProjectRoot(projectDirectory);
  const planPath = resolve(projectRoot, ".agent", "planMsg.md");
  const document = await readPlanDocument(planPath);
  return { ok: true, path: planPath, projectRoot, plans: document.plans };
}

async function readPlanDocument(planPath: string): Promise<ProjectPlanDocument> {
  const content = await readTextIfPresent(planPath);
  if (content === undefined) return { ...EMPTY_DOCUMENT, plans: [] };

  const start = content.indexOf(DATA_START);
  const end = content.indexOf(DATA_END);
  if (start < 0 || end < start) {
    throw new Error("Unsupported or invalid .agent/planMsg.md managed data block.");
  }
  const block = content.slice(start + DATA_START.length, end).trim();
  const json = block.replace(/^```json\s*/u, "").replace(/\s*```$/u, "");
  return validateDocument(JSON.parse(json) as unknown);
}

function validateDocument(value: unknown): ProjectPlanDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.plans)) {
    throw new Error("Unsupported or invalid project plan document.");
  }
  return { schemaVersion: 1, plans: value.plans.map(validatePlan) };
}

function validatePlan(value: unknown): ProjectPlan {
  if (!isRecord(value) || !Array.isArray(value.transitions)) {
    throw new Error("Project plan entries must be objects with transitions.");
  }
  const status = parseStatus(value.status);
  const plan: ProjectPlan = {
    id: requiredText(value.id, "stored plan id").toLocaleUpperCase(),
    title: requiredText(value.title, "stored plan title"),
    summary: requiredText(value.summary, "stored plan summary"),
    status,
    successCriteria: stringList(value.successCriteria, "successCriteria"),
    specRefs: stringList(value.specRefs, "specRefs"),
    decisions: stringList(value.decisions, "decisions"),
    createdAt: requiredText(value.createdAt, "stored plan createdAt"),
    updatedAt: requiredText(value.updatedAt, "stored plan updatedAt"),
    transitions: value.transitions.map((transition) => {
      if (!isRecord(transition)) throw new Error("Project plan transitions must be objects.");
      return {
        from: transition.from === null ? null : parseStatus(transition.from),
        to: parseStatus(transition.to),
        reason: requiredText(transition.reason, "stored transition reason"),
        at: requiredText(transition.at, "stored transition timestamp"),
      };
    }),
  };
  if (typeof value.dedupeKey === "string" && value.dedupeKey.trim().length > 0) {
    plan.dedupeKey = value.dedupeKey.trim();
  } else {
    plan.dedupeKey = buildPlanDedupeKey(plan);
  }
  return plan;
}

function renderPlanDocument(document: ProjectPlanDocument): string {
  const data = `${DATA_START}\n\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\`\n${DATA_END}`;
  const plans = document.plans.map(renderPlan).join("\n\n");
  return [
    "# Project Plans",
    "",
    "> Managed project-level plans only. Routine bugs, implementation tasks, and development journals do not belong here.",
    "",
    data,
    plans.length > 0 ? `\n${plans}` : "",
    "",
  ].join("\n");
}

function renderPlan(plan: ProjectPlan): string {
  return [
    `## ${plan.id} ${plan.title}`,
    "",
    `- Status: \`${plan.status}\``,
    `- Updated: ${plan.updatedAt}`,
    `- Plan references: ${renderValues(plan.specRefs)}`,
    "",
    plan.summary,
    "",
    "### Success Criteria",
    "",
    renderBullets(plan.successCriteria),
    "",
    "### Decisions",
    "",
    renderBullets(plan.decisions),
    "",
    "### Status History",
    "",
    ...plan.transitions.map(
      (transition) =>
        `- ${transition.at}: ${transition.from ?? "created"} -> ${transition.to} — ${transition.reason}`,
    ),
  ].join("\n");
}

function renderValues(values: string[]): string {
  return values.length === 0 ? "none" : values.map((value) => `\`${value}\``).join(", ");
}

function renderBullets(values: string[]): string {
  return values.length === 0 ? "- Not recorded." : values.map((value) => `- ${value}`).join("\n");
}

function normalizeInput(input: ProjectPlanInput): ProjectPlanInput & Required<Pick<ProjectPlanInput, "title" | "summary">> {
  return {
    title: requiredText(input.title, "title"),
    summary: requiredText(input.summary, "summary"),
    successCriteria: uniqueStrings(input.successCriteria),
    specRefs: uniqueStrings(input.specRefs),
    decisions: uniqueStrings(input.decisions),
  };
}

function buildPlanDedupeKey(input: ProjectPlanInput): string {
  const canonical = {
    title: normalizeDedupeText(input.title),
    summary: normalizeDedupeText(input.summary),
    successCriteria: canonicalList(input.successCriteria),
    specRefs: canonicalList(input.specRefs),
    decisions: canonicalList(input.decisions),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

function canonicalList(values: string[] | undefined): string[] {
  return [...(values ?? [])].map(normalizeDedupeText).filter(Boolean).sort();
}

function normalizeDedupeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function nextPlanId(plans: ProjectPlan[]): string {
  const maximum = plans.reduce((current, plan) => {
    const match = /^P(\d+)$/.exec(plan.id);
    return match?.[1] === undefined ? current : Math.max(current, Number.parseInt(match[1], 10));
  }, 0);
  return `P${String(maximum + 1).padStart(3, "0")}`;
}

function parseStatus(value: unknown): ProjectPlanStatus {
  if (typeof value !== "string" || !STATUSES.includes(value as ProjectPlanStatus)) {
    throw new Error(`Project plan status must be one of: ${STATUSES.join(", ")}.`);
  }
  return value as ProjectPlanStatus;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Project plan ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function uniqueStrings(values: string[] | undefined): string[] {
  if (values === undefined) return [];
  return [...new Set(stringList(values, "input list").map((value) => value.trim()).filter(Boolean))];
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Project plan ${field} must be a string array.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
