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
  handoffGuidance: ProjectAnalysisLine[];
  advisories: ProjectAdvisory[];
}

export interface ProjectInventory {
  schemaVersion: 1;
  projectRoot: ".";
  fingerprint: string;
  scan: ProjectInventoryScan;
  capabilities: ProjectCapabilities;
  profile: ProjectProfile;
  resources: ProjectResource[];
  paths: string[];
}

export interface ProjectInventoryScan {
  maxDepth: number;
  entryLimit: number;
  entriesSeen: number;
  observedMaxDepth: number;
  truncated: boolean;
  truncationReasons: Array<"depth-limit" | "entry-limit">;
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

export interface ProjectAuthorizations {
  schemaVersion: 1;
  authorizations: {
    solAdvisor?: {
      implicitDelegation?: boolean;
    };
  };
}

export type SolAdvisorDelegationPolicy = "inherit" | "allow" | "deny";

export type NotebookLmProjectMode = "schematic" | "manual" | "disabled";
export type NotebookLmNotebookScope = "project" | "public";
export type NotebookLmComponentCategory =
  | "mcu"
  | "driver"
  | "power"
  | "communication"
  | "sensor"
  | "mos"
  | "other";
export type NotebookLmDocumentType =
  | "datasheet"
  | "reference-manual"
  | "errata"
  | "application-note"
  | "hardware-design-guide"
  | "other";
export type NotebookLmSourceStatus =
  | "ready"
  | "processing"
  | "error"
  | "missing"
  | "unverified";

export interface NotebookLmNotebookBinding {
  scope: NotebookLmNotebookScope;
  id: string;
  title: string;
}

export interface NotebookLmSourceBinding {
  notebookId: string;
  sourceId: string;
  title: string;
  documentType: NotebookLmDocumentType;
  status: NotebookLmSourceStatus;
  version?: string;
}

export interface NotebookLmComponentBinding {
  refdes: string;
  partNumber: string;
  category: NotebookLmComponentCategory;
  page: number;
  confidence: "high" | "medium" | "low";
  package?: string;
  sources: NotebookLmSourceBinding[];
}

export interface NotebookLmExperienceNoteBinding {
  notebookId: string;
  noteId: string;
  title: string;
  subject: string;
  status: "verified" | "provisional";
}

export interface NotebookLmProjectIndex {
  schemaVersion: 1;
  mode: NotebookLmProjectMode;
  notebooks: NotebookLmNotebookBinding[];
  components: NotebookLmComponentBinding[];
  notes: NotebookLmExperienceNoteBinding[];
  advisories: string[];
  schematic?: {
    path: string;
    sha256: string;
  };
  lastRefreshedAt?: string;
}

export type NotebookLmLibraryCategory = "mcu" | "driver" | "mos" | "other-ic";
export type NotebookLmLibraryFileStatus =
  | "pending"
  | "ready"
  | "failed"
  | "ambiguous"
  | "duplicate"
  | "superseded";

export interface NotebookLmLibraryManifestEntry {
  path: string;
  sha256: string;
  size: number;
  modifiedAt: string;
  category: NotebookLmLibraryCategory;
  documentType: NotebookLmDocumentType;
  partNumbers: string[];
  confidence: "high" | "medium" | "low";
  status: NotebookLmLibraryFileStatus;
  manufacturer?: string;
  documentNumber?: string;
  revision?: string;
  publishedAt?: string;
  sourceId?: string;
  sourceTitle?: string;
  lastAttemptAt?: string;
}

export interface NotebookLmLibraryManifest {
  schemaVersion: 1;
  publicNotebook: {
    id: string;
    title: string;
  };
  files: NotebookLmLibraryManifestEntry[];
}

export type SolAdvisorImplicitDelegationAction =
  | "enable"
  | "disable"
  | "inherit"
  | "remove";

export interface HandoffSections {
  objective: string;
  currentState: string;
  remainingWork: string;
  workCompleted?: string;
  bugDiagnosis?: string;
  decisionsAndConstraints?: string;
  failedAttempts?: string;
  verification?: string;
  risks?: string;
  evidence?: string;
}

export type HandoffKind =
  | "feature"
  | "bug"
  | "investigation"
  | "maintenance"
  | "verification";

export interface HandoffRouting {
  specRefs: string[];
  bugIds: string[];
  modules: string[];
  files: string[];
  symbols: string[];
  tests: string[];
  tags: string[];
  aliases: string[];
}

export interface HandoffInput {
  title: string;
  summary: string;
  kind: HandoffKind;
  sections: HandoffSections;
  cycle?: string;
  specRefs?: string[];
  modules?: string[];
  symbols?: string[];
  files?: string[];
  bugIds?: string[];
  tests?: string[];
  tags?: string[];
  aliases?: string[];
  workId?: string;
  expectedRevision?: number;
  status?: HandoffStatus;
  reopen?: boolean;
  checkpoint?: boolean;
  checkpointReason?: string;
}

export interface HandoffCheckpointInput {
  workId: string;
  expectedRevision: number;
  checkpointOnly: true;
  checkpointReason: string;
}

export type HandoffWriteInput = HandoffInput | HandoffCheckpointInput;

export type HandoffStatus = "active" | "blocked" | "completed" | "superseded";

export interface HandoffIndexEntry {
  workId: string;
  cycle: string;
  title: string;
  summary: string;
  kind: HandoffKind;
  routing: HandoffRouting;
  availableSections: string[];
  groupKey: string;
  dedupeKey: string;
  currentPath: string;
  revision: number;
  status: HandoffStatus;
  legacyRecordIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HandoffIndex {
  schemaVersion: 4;
  entries: HandoffIndexEntry[];
}

export interface LegacyHandoffIndexEntry {
  id: string;
  cycle: string;
  title: string;
  summary: string;
  kind: HandoffKind;
  routing: HandoffRouting;
  availableSections: string[];
  groupKey: string;
  dedupeKey: string;
  path: string;
  createdAt: string;
}

export interface LegacyHandoffIndex {
  schemaVersion: 3;
  entries: LegacyHandoffIndexEntry[];
}

export type StoredHandoffIndex = HandoffIndex | LegacyHandoffIndex;

export interface HandoffRecordReference {
  workId: string;
  revision: number;
  path: string;
  availableSections: string[];
  createdAt: string;
}

export interface HandoffMatch {
  entry: HandoffIndexEntry;
  score: number;
  reasons: string[];
  confidence: "exact" | "high" | "medium";
  records: HandoffRecordReference[];
  lexicalScore?: number;
  bm25Score?: number;
  matchedTerms?: string[];
  termCoverage?: number;
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
