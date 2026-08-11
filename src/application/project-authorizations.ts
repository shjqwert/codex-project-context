import { resolve } from "node:path";
import type { ProjectAuthorizations } from "../types.js";
import {
  readJsonIfPresent,
  removeFileIfPresent,
  writeJsonAtomic,
} from "../infrastructure/files.js";

export const PROJECT_AUTHORIZATIONS_PATH = ".agent/authorizations.json";

export async function readProjectAuthorizations(
  projectRoot: string,
): Promise<ProjectAuthorizations | undefined> {
  const path = resolve(projectRoot, PROJECT_AUTHORIZATIONS_PATH);
  const value = await readJsonIfPresent<unknown>(path);
  return value === undefined ? undefined : validateProjectAuthorizations(value);
}

export async function writeSolAdvisorImplicitDelegationAuthorization(
  projectRoot: string,
): Promise<string> {
  const path = resolve(projectRoot, PROJECT_AUTHORIZATIONS_PATH);
  const value: ProjectAuthorizations = {
    schemaVersion: 1,
    authorizations: {
      solAdvisor: {
        implicitDelegation: true,
      },
    },
  };
  await writeJsonAtomic(path, value);
  return path;
}

export async function removeProjectAuthorizations(projectRoot: string): Promise<string> {
  const path = resolve(projectRoot, PROJECT_AUTHORIZATIONS_PATH);
  await removeFileIfPresent(path);
  return path;
}

export function validateProjectAuthorizations(value: unknown): ProjectAuthorizations {
  if (!isRecord(value)) throw new Error("Project authorizations must be an object.");
  assertOnlyKeys(value, ["schemaVersion", "authorizations"], "project authorizations");
  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported project authorizations schemaVersion.");
  }
  if (!isRecord(value.authorizations)) {
    throw new Error("Project authorizations.authorizations must be an object.");
  }
  assertOnlyKeys(value.authorizations, ["solAdvisor"], "project authorizations.authorizations");
  if (!isRecord(value.authorizations.solAdvisor)) {
    throw new Error("Project authorizations.solAdvisor must be an object.");
  }
  assertOnlyKeys(
    value.authorizations.solAdvisor,
    ["implicitDelegation"],
    "project authorizations.solAdvisor",
  );
  if (value.authorizations.solAdvisor.implicitDelegation !== true) {
    throw new Error("Project authorizations.solAdvisor.implicitDelegation must be true.");
  }
  return {
    schemaVersion: 1,
    authorizations: {
      solAdvisor: {
        implicitDelegation: true,
      },
    },
  };
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
  field: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${field} contains unsupported fields: ${unexpected.join(", ")}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
