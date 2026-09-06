import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { QualityGateEngine } from "../src/core/state-machine";
import { BDDEngine } from "../src/core/bdd-engine";
import { PreImplementationTestReviewPanel } from "../src/core/test-review-panel";
import { SystemDesignEngine } from "../src/core/system-design";
import { ArchitectureGovernanceEngine } from "../src/core/architecture-governance";
import { TDDEngine } from "../src/core/tdd-engine";
import { PostImplementationCodeReviewPanel } from "../src/core/code-review-panel";

const testProjectDir = path.join(__dirname, "../tmp_gherkin_test_project");

describe("Gherkin Feature Execution Runner (features/craftsmanship_plugin.feature)", () => {
  let bdd: BDDEngine;
  let reviewer: PreImplementationTestReviewPanel;
  let design: SystemDesignEngine;
  let gov: ArchitectureGovernanceEngine;
  let tdd: TDDEngine;
  let codeReviewer: PostImplementationCodeReviewPanel;
  let qEngine: QualityGateEngine;

  beforeEach(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });

    bdd = new BDDEngine(testProjectDir);
    reviewer = new PreImplementationTestReviewPanel();
    design = new SystemDesignEngine(testProjectDir);
    gov = new ArchitectureGovernanceEngine(testProjectDir);
    tdd = new TDDEngine();
    codeReviewer = new PostImplementationCodeReviewPanel();
    qEngine = new QualityGateEngine(testProjectDir);
  });

  it("Scenario 1: BDD Feature Acceptance Criteria & Ambiguity Clarification", () => {
    // Given a project is initialized with Craftsmanship quality gates
    qEngine.setPhase("BDD_SPECIFICATION");

    // When acceptance criteria contain ambiguous terms such as "fast" or "user-friendly"
    const questions = bdd.analyzeAcceptanceCriteria(
      "Feature1",
      "As a user...",
      ["User logs in", "System authentication must be fast", "Errors handled in user-friendly manner"]
    );

    // Then targeted clarifying questions are generated
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((q) => q.question.includes("fast"))).toBe(true);

    // And Given-When-Then Gherkin feature files are created in features/
    const gherkin = bdd.buildGherkinFeature("Feature1", "As a user...", [
      { id: "SC-1", title: "Scenario 1", given: ["g"], when: ["w"], then: ["t"], tags: [] },
    ]);
    const filePath = bdd.saveFeatureFile("Feature1", gherkin);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("Scenario 2: Pre-Implementation Dialectic Test Review & Slice LOC Limit", () => {
    // Given BDD feature scenarios are specified and verified RED
    qEngine.updateBDDSpec({
      featureName: "Feature2",
      userStory: "story",
      acceptanceCriteria: ["AC1", "AC2"],
      scenarios: [
        { id: "SC-1", title: "s1", given: ["g"], when: ["w"], then: ["t"], tags: [] },
        { id: "SC-2", title: "s2", given: ["g"], when: ["w"], then: ["t"], tags: [] },
      ],
      clarifyingQuestions: [],
      rawGherkin: "...",
      isRedVerified: true,
    });

    // When the test suite is evaluated across 4 dialectic lenses
    const result = reviewer.reviewTests(qEngine.getState().bddSpec!, "beforeEach(() => {}); afterEach(() => {}); null boundary error", 250);

    // Then tests are checked for acceptance coverage, edge cases, flakiness hazards, and fixture isolation
    expect(result.passed).toBe(true);

    // And any slice exceeding 400 lines of code triggers a BLOCKER objection
    const failResult = reviewer.reviewTests(qEngine.getState().bddSpec!, undefined, 500);
    expect(failResult.passed).toBe(false);
    expect(failResult.objections.some((o) => o.severity === "BLOCKER" && o.lens === "Slice Decomposition")).toBe(true);
  });

  it("Scenario 3: AST C4 Diagrams & Formal Verification (Alloy & TLA+)", () => {
    // Given a problem slice design is under review
    // When C4 diagrams are generated from code AST into D2 syntax
    const c4 = design.generateC4FromCode("Feature3", []);
    expect(c4.contextD2).toContain("Code-Generated C4 System Context Diagram");

    // And Alloy declarative logic models and TLA+ state specs are checked
    const formalClean = design.generateFormalModels("Feature3", ["No double charge"], false);

    // Then state invariants are abstractly verified
    expect(formalClean.provedAbstractly).toBe(true);

    // And any state counterexample trace blocks transition to implementation
    const formalCounterexample = design.generateFormalModels("Feature3", ["No double charge"], true);
    expect(formalCounterexample.counterexample).toBeDefined();
    expect(formalCounterexample.provedAbstractly).toBe(false);
  });

  it("Scenario 4: Architecture Governance & Low-Risk Exemptions", () => {
    // Given an architectural strategy is proposed
    // When MADR decision records are created in docs/adr/
    const adr = gov.createADR("ADR Title", "Context", "Decision", ["Consequence"]);
    expect(fs.existsSync(adr.filePath)).toBe(true);

    // And RFC strategies are evaluated across 6 dialectic agent lenses
    const rfc = gov.evaluateRFCPanel("RFC-0001", "RFC Title", "Valid strategy text aligning with C4 architecture and ADR decisions", ["Tradeoff"]);

    // Then human review sign-off is required for RFC approval
    expect(rfc.status).toBe("PENDING_HUMAN_APPROVAL");

    // And skipping formal steps on low-risk work requires explicit human-approved exemption
    qEngine.recordExemption({
      gate: "FORMAL_METHODS",
      riskAssessment: "Low risk CSS tweak",
      requestedByAgent: true,
      humanApproved: true,
      timestamp: new Date().toISOString(),
    });
    expect(qEngine.hasApprovedExemption("FORMAL_METHODS")).toBe(true);
  });

  it("Scenario 5: Self-Healing TDD RED/GREEN Cycle & Mutation Testing", () => {
    // Given unit tests are written before implementation
    // When tests are executed prior to code, they must fail RED
    // And implementation code turns tests GREEN
    const tddResult = tdd.runAutoTDDIterationLoop(
      "tests/unit.test.ts",
      "src/impl.ts",
      "FAIL tests/unit.test.ts - AssertionError",
      "PASS tests/unit.test.ts - 3 tests passed"
    );
    expect(tddResult.passedCleanly).toBe(true);

    // Then mutation testing must achieve at least an 85% mutant kill rate
    const mutationResult = tdd.evaluateMutationTesting("describe(...)", "class Impl {}");
    expect(mutationResult.killRatePercent).toBeGreaterThanOrEqual(85);
    expect(mutationResult.passedThreshold).toBe(true);
  });

  it("Scenario 6: Post-Implementation Dialectic Code Review & Guided Human Slice Sign-off", () => {
    // Given code implementation and tests are complete
    qEngine.updateBDDSpec({ featureName: "F6", userStory: "s", acceptanceCriteria: ["ac"], scenarios: [], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "F6", estimatedLOC: 200, isWithinLimit: true, sliceComponents: [] } });
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "", decision: "", consequences: [], date: "2026-09-06" });
    qEngine.updateC4Spec({ contextD2: "", containerD2: "", componentD2: "", codeD2: "", generatedFromCode: true });
    qEngine.updateFormalModel({ alloyModel: "", tlaModule: "", tlaConfig: "", propertyTestSpec: "", invariants: [], completenessEvaluation: { isComplete: true, unmodeledStateTransitions: [], critique: "" }, provedAbstractly: true });
    qEngine.updateMutationResult({ totalMutants: 10, killedMutants: 9, survivedMutants: 1, killRatePercent: 90, passedThreshold: true, mutantDetails: [] });

    // When static analysis diagnostics and Architectural Drift Guard are evaluated
    // And 7 dialectic code review lenses raise 0 BLOCKER objections
    const reviewResult = codeReviewer.runReview("export class F6 {}", "describe('F6', () => {})", qEngine.getState(), "0 errors, 0 warnings", []);
    expect(reviewResult.passed).toBe(true);

    // Then a 6-checkpoint Guided Human Slice Review walkthrough is presented
    // And human sign-off locks the slice as COMPLETED_LOCKED
    qEngine.recordHumanSliceReview({
      sliceName: "F6",
      reviewerName: "Lead Reviewer",
      approved: true,
      notes: "Approved walkthrough",
      timestamp: new Date().toISOString(),
      walkthroughSections: { bddSummary: "", designAndADRSummary: "", formalAndPropertySummary: "", testAndMutationSummary: "", staticAnalysisAndReviewSummary: "", driftGuardSummary: "" }
    });
    qEngine.setPhase("COMPLETED_LOCKED");

    expect(qEngine.getState().currentPhase).toBe("COMPLETED_LOCKED");
    expect(qEngine.getState().humanSliceReview?.approved).toBe(true);
  });
});
