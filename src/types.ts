export interface ProjectCapabilities {
  codegraph: boolean;
  serena: boolean;
  openspec: boolean;
}

export interface ProjectContext {
  schemaVersion: 1;
  projectRoot: ".";
  currentCycle: string;
  agentsFile: string;
  handoffIndex: string;
  capabilities: ProjectCapabilities;
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
  path: string;
  createdAt: string;
}

export interface HandoffIndex {
  schemaVersion: 1;
  entries: HandoffIndexEntry[];
}

export interface HandoffMatch {
  entry: HandoffIndexEntry;
  score: number;
  reasons: string[];
}

