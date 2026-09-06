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

export interface TestReviewLensScore {
  lens: "ACCEPTANCE_CRITERIA" | "EDGE_CASES" | "FLAKINESS_RISK" | "FIXTURES_AND_CLOSURES";
  score: number; // 0 - 100
  passed: boolean;
  critique: string;
  recommendations: string[];
}

export interface SliceDecompositionResult {
  sliceName: string;
  estimatedLOC: number;
  isWithinLimit: boolean; // LOC < 400
  sliceComponents: string[];
}

export interface MultiLensTestReviewResult {
  passed: boolean;
  lenses: TestReviewLensScore[];
  sliceDecomposition: SliceDecompositionResult;
  overallCritique: string;
}

export interface C4DiagramSpec {
  contextD2: string;
  containerD2: string;
  componentD2: string;
  codeD2: string;
  isValidD2Syntax: boolean;
}

export interface FormalModelSpec {
  alloyModel: string; // .als content
  tlaModule: string; // .tla content
  tlaConfig: string; // .cfg content
  propertyTestSpec: string; // Property-based test spec
  invariants: string[];
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

export interface RFCLensScore {
  lens: "SECURITY" | "CONSISTENCY" | "EFFICIENCY" | "SIMPLICITY" | "MAINTAINABILITY" | "ELEGANCE";
  reviewer: string; // e.g. "Security Agent Lens"
  score: number; // 0 - 100
  critique: string;
  concerns: string[];
  approvalGranted: boolean;
}

export interface RFCRecord {
  id: string; // e.g. "RFC-0001"
  title: string;
  author: string;
  status: "DRAFT" | "UNDER_MULTI_LENS_REVIEW" | "PENDING_HUMAN_APPROVAL" | "APPROVED" | "REJECTED";
  strategyDescription: string;
  tradeOffs: string[];
  lensReviews: RFCLensScore[];
  humanReviewerNotes?: string;
  humanApproved?: boolean;
}

export interface TDDCycleState {
  unitTestFilePath: string;
  implementationFilePath: string;
  redVerified: boolean; // Test failed before code was written
  redFailureMessage?: string;
  greenVerified: boolean; // Test passed after code was written
  greenOutput?: string;
}

export interface MutationTestResult {
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  killRatePercent: number;
  passedThreshold: boolean; // >= 85%
  mutantDetails: Array<{ mutantId: string; file: string; line: number; mutation: string; status: "KILLED" | "SURVIVED" }>;
}

export interface StaticAnalysisDiagnostics {
  lintErrors: number;
  lintWarnings: number;
  typeErrors: number;
  securityIssues: number;
  toolOutputs: Record<string, string>;
}

export interface CodeReviewLensScore {
  lens: "SECURITY" | "SIMPLICITY" | "EFFICIENCY" | "ADHERENCE_TO_DESIGN" | "TEST_QUALITY" | "ELEGANCE_SOC" | "CONSISTENCY";
  score: number; // 0 - 100
  critique: string;
  actionItems: string[];
  passed: boolean;
}

export interface FinalCodeReviewResult {
  passed: boolean;
  staticAnalysis: StaticAnalysisDiagnostics;
  lenses: CodeReviewLensScore[];
  summary: string;
}

export interface QualityGateState {
  currentPhase: WorkflowPhase;
  sliceName: string;
  bddSpec?: BDDFeatureSpec;
  testReview?: MultiLensTestReviewResult;
  c4Spec?: C4DiagramSpec;
  formalModel?: FormalModelSpec;
  adrs: ADRRecord[];
  rfcs: RFCRecord[];
  tddCycles: TDDCycleState[];
  mutationResult?: MutationTestResult;
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
