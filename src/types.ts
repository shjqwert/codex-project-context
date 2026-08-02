export interface ProjectCapabilities {
  codegraph: boolean;
  serena: boolean;
  openspec: boolean;
}

export interface ProjectProfile {
  name: string;
  projectTypes: string[];
  languages: string[];
  sourceDirectories: string[];
  testDirectories: string[];
  specificationDirectories: string[];
}

export type ProjectResourceKind =
  | "documentation"
  | "manual"
  | "hardware"
  | "specification"
  | "test";

export interface ProjectResource {
  kind: ProjectResourceKind;
  path: string;
  purpose: string;
}

export interface ProjectAnalysisLine {
  text: string;
  evidencePaths: string[];
}

export interface ProjectAnalysisReference extends ProjectResource {
  evidencePaths: string[];
}

export type ProjectAdvisoryKind =
  | "missing-reference"
  | "unconfirmed-fact"
  | "configuration-conflict";

export interface ProjectAdvisory {
  kind: ProjectAdvisoryKind;
  subject: string;
  reason: string;
  action: "remind-user" | "none";
  evidencePaths: string[];
}

export interface ProjectAnalysisDraft {
  schemaVersion: 1;
  inventoryFingerprint: string;
  overview: ProjectAnalysisLine[];
  buildAndVerification: ProjectAnalysisLine[];
  codeAnalysis: ProjectAnalysisLine[];
  references: ProjectAnalysisReference[];
  referenceGuidance: ProjectAnalysisLine[];
  handoffSubjects: string[];
  advisories: ProjectAdvisory[];
}

export interface ProjectInventory {
  schemaVersion: 1;
  projectRoot: ".";
  fingerprint: string;
  capabilities: ProjectCapabilities;
  profile: ProjectProfile;
  resources: ProjectResource[];
  paths: string[];
}

export interface ProjectContext {
  schemaVersion: 1 | 2;
  projectRoot: ".";
  currentCycle: string;
  agentsFile: string;
  handoffIndex: string;
  capabilities: ProjectCapabilities;
  profile?: ProjectProfile;
  resources?: ProjectResource[];
  inventoryFingerprint?: string;
  analysis?: ProjectAnalysisDraft;
}

export interface HandoffSections {
  objective?: string;
  startingState?: string;
  workCompleted?: string;
  bugDiagnosis?: string;
  behavioralConstraints?: string;
  changedAreas?: string;
  verification?: string;
  risks?: string;
  evidence?: string;
}

export interface HandoffInput {
  title: string;
  summary: string;
  cycle?: string;
  kind?: string[];
  specRefs?: string[];
  modules?: string[];
  symbols?: string[];
  files?: string[];
  bugIds?: string[];
  tests?: string[];
  tags?: string[];
  sections?: HandoffSections;
}

export interface HandoffIndexEntry {
  id: string;
  cycle: string;
  title: string;
  summary: string;
  specRefs: string[];
  bugIds: string[];
  modules: string[];
  files: string[];
  symbols: string[];
  testNames: string[];
  tags: string[];
  sections: string[];
  sectionSummaries: HandoffSectionSummary[];
  groupKey: string;
  dedupeKey?: string;
  path: string;
  createdAt: string;
}

export interface HandoffSectionSummary {
  name: string;
  summary: string;
}

export interface HandoffIndex {
  schemaVersion: 2;
  entries: HandoffIndexEntry[];
}

export interface HandoffMatch {
  entry: HandoffIndexEntry;
  score: number;
  reasons: string[];
  confidence: "exact" | "high" | "medium";
  relatedIds: string[];
  suggestedSections: HandoffSectionSummary[];
}

export type ProjectPlanStatus =
  | "proposed"
  | "accepted"
  | "in-progress"
  | "completed"
  | "rejected"
  | "superseded";

export interface ProjectPlanTransition {
  from: ProjectPlanStatus | null;
  to: ProjectPlanStatus;
  reason: string;
  at: string;
}

export interface ProjectPlan {
  id: string;
  title: string;
  summary: string;
  status: ProjectPlanStatus;
  successCriteria: string[];
  specRefs: string[];
  decisions: string[];
  dedupeKey?: string;
  createdAt: string;
  updatedAt: string;
  transitions: ProjectPlanTransition[];
}

export interface ProjectPlanInput {
  title: string;
  summary: string;
  successCriteria?: string[];
  specRefs?: string[];
  decisions?: string[];
}

export interface ProjectPlanDocument {
  schemaVersion: 1;
  plans: ProjectPlan[];
}
