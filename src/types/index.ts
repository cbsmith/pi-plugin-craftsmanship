/**
 * Types and interfaces for the Pi Craftsmanship Plugin
 */

export type WorkflowPhase =
  | "UNINITIALIZED"
  | "BDD_SPECIFICATION"
  | "BDD_RED_VERIFICATION"
  | "MULTI_LENS_TEST_REVIEW"
  | "SYSTEM_DESIGN_C4_FORMAL"
  | "ADR_RFC_GOVERNANCE"
  | "TDD_UNIT_RED_GREEN"
  | "MUTATION_TESTING"
  | "MULTI_LENS_CODE_REVIEW"
  | "COMPLETED_LOCKED";

export type SeverityLevel = "BLOCKER" | "MAJOR" | "MINOR";

export interface DialecticObjection {
  id: string;
  lens: string; // e.g. "Security", "Simplicity", "Acceptance Criteria", etc.
  severity: SeverityLevel;
  title: string;
  critique: string;
  requiredAction: string;
  addressed: boolean;
  resolutionNotes?: string;
}

export interface DialecticReviewResult {
  passed: boolean; // passed if 0 BLOCKER and 0 unaddressed MAJOR objections
  objections: DialecticObjection[];
  summary: string;
  reReviewRequired: boolean;
  iterationCount: number;
}

export interface GherkinScenario {
  id: string;
  title: string;
  given: string[];
  when: string[];
  then: string[];
  tags: string[];
}

export interface ClarifyingQuestion {
  id: string;
  topic: string;
  question: string;
  options?: string[];
  answer?: string;
  resolved: boolean;
}

export interface BDDFeatureSpec {
  featureName: string;
  userStory: string;
  acceptanceCriteria: string[];
  scenarios: GherkinScenario[];
  clarifyingQuestions: ClarifyingQuestion[];
  rawGherkin: string;
  isRedVerified: boolean;
  redOutput?: string;
}

export interface SliceDecompositionResult {
  sliceName: string;
  estimatedLOC: number;
  isWithinLimit: boolean; // LOC < 400
  sliceComponents: string[];
}

export interface FormalCounterexampleTrace {
  invariantViolated: string;
  stateTrace: Array<{ step: number; stateName: string; variables: Record<string, any> }>;
  rawOutput: string;
}

export interface FormalCompletenessEvaluation {
  isComplete: boolean;
  unmodeledStateTransitions: string[];
  critique: string;
}

export interface C4DiagramSpec {
  contextD2: string;
  containerD2: string;
  componentD2: string;
  codeD2: string;
  generatedFromCode: boolean;
}

export interface FormalModelSpec {
  alloyModel: string; // .als content
  tlaModule: string; // .tla content
  tlaConfig: string; // .cfg content
  propertyTestSpec: string; // Stateful fast-check property test spec
  invariants: string[];
  completenessEvaluation: FormalCompletenessEvaluation;
  counterexample?: FormalCounterexampleTrace;
  provedAbstractly: boolean;
}

export interface ADRRecord {
  id: string; // e.g. "0001"
  title: string;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  context: string;
  decision: string;
  consequences: string[];
  date: string;
}

export interface RFCRecord {
  id: string; // e.g. "RFC-0001"
  title: string;
  author: string;
  status: "DRAFT" | "UNDER_MULTI_LENS_REVIEW" | "PENDING_HUMAN_APPROVAL" | "APPROVED" | "REJECTED";
  strategyDescription: string;
  tradeOffs: string[];
  reviewResult: DialecticReviewResult;
  humanReviewerNotes?: string;
  humanApproved?: boolean;
}

export interface AutoTDDResult {
  redVerified: boolean;
  greenVerified: boolean;
  iterations: number;
  testFailureTrace?: string;
  passedCleanly: boolean;
}

export interface TDDCycleState {
  unitTestFilePath: string;
  implementationFilePath: string;
  redVerified: boolean;
  redFailureMessage?: string;
  greenVerified: boolean;
  greenOutput?: string;
  autoTddIterations?: number;
}

export interface MutationTestResult {
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  killRatePercent: number;
  passedThreshold: boolean; // >= 85%
  mutantDetails: Array<{ mutantId: string; file: string; line: number; mutation: string; status: "KILLED" | "SURVIVED" }>;
}

export interface ArchitecturalDriftReport {
  hasDrift: boolean;
  detectedComponents: string[];
  detectedDependencies: Array<{ from: string; to: string }>;
  undocumentedChanges: string[];
  updatedD2Diagram: string;
}

export interface StaticAnalysisDiagnostics {
  lintErrors: number;
  lintWarnings: number;
  typeErrors: number;
  securityIssues: number;
  toolOutputs: Record<string, string>;
}

export interface FinalCodeReviewResult {
  passed: boolean;
  staticAnalysis: StaticAnalysisDiagnostics;
  dialecticReview: DialecticReviewResult;
  driftReport: ArchitecturalDriftReport;
  summary: string;
}

export interface QualityGateState {
  currentPhase: WorkflowPhase;
  sliceName: string;
  hardGateEnforced: boolean;
  bddSpec?: BDDFeatureSpec;
  testReview?: DialecticReviewResult & { sliceDecomposition: SliceDecompositionResult };
  c4Spec?: C4DiagramSpec;
  formalModel?: FormalModelSpec;
  adrs: ADRRecord[];
  rfcs: RFCRecord[];
  tddCycles: TDDCycleState[];
  mutationResult?: MutationTestResult;
  driftReport?: ArchitecturalDriftReport;
  finalReview?: FinalCodeReviewResult;
}

export interface ExtensionUI {
  notify(message: string, type?: "info" | "success" | "warning" | "error"): void;
  confirm(prompt: string): Promise<boolean>;
  ask(prompt: string): Promise<string>;
}

export interface ExtensionContext {
  ui: ExtensionUI;
  cwd: string;
}

export interface ToolDefinition<T = any> {
  name: string;
  label?: string;
  description: string;
  parameters: T;
  execute: (toolCallId: string, params: any, ctx: ExtensionContext) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

export interface CommandDefinition {
  description: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
}

export interface ExtensionAPI {
  registerTool(tool: ToolDefinition): void;
  registerCommand(name: string, command: CommandDefinition): void;
  on(event: string, handler: (eventData: any, ctx: ExtensionContext) => Promise<void> | void): void;
}
