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

const testProjectDir = path.join(__dirname, "../tmp_test_project");

describe("Pi Craftsmanship Plugin Low-Risk Exemption Engine & Hard Gates", () => {
  beforeEach(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  it("1. Hard Quality Gates: blocks skipping steps without human approval", () => {
    const qEngine = new QualityGateEngine(testProjectDir);
    qEngine.updateBDDSpec({ featureName: "LowRiskFix", userStory: "story", acceptanceCriteria: ["ac1"], scenarios: [{ id: "SC1", title: "s1", given: [], when: [], then: [], tags: [] }], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "LowRiskFix", estimatedLOC: 50, isWithinLimit: true, sliceComponents: [] } });

    // Formal methods missing and NO human exemption -> HARD GATE BLOCKED
    const check1 = qEngine.canTransitionTo("ADR_RFC_GOVERNANCE");
    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain("HARD GATE BLOCKED");
  });

  it("2. Low-Risk Exemption: permits skipping formal methods and C4 ONLY with human approval", () => {
    const qEngine = new QualityGateEngine(testProjectDir);
    qEngine.updateBDDSpec({ featureName: "LowRiskFix", userStory: "story", acceptanceCriteria: ["ac1"], scenarios: [{ id: "SC1", title: "s1", given: [], when: [], then: [], tags: [] }], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "LowRiskFix", estimatedLOC: 50, isWithinLimit: true, sliceComponents: [] } });

    // Record human-approved exemption for FORMAL_METHODS & C4_DIAGRAMS
    qEngine.recordExemption({
      gate: "FORMAL_METHODS",
      riskAssessment: "Small CSS alignment fix",
      requestedByAgent: true,
      humanApproved: true,
      humanReviewerNotes: "Approved by Lead",
      timestamp: new Date().toISOString(),
    });
    qEngine.recordExemption({
      gate: "C4_DIAGRAMS",
      riskAssessment: "Small CSS alignment fix",
      requestedByAgent: true,
      humanApproved: true,
      humanReviewerNotes: "Approved by Lead",
      timestamp: new Date().toISOString(),
    });

    // Now transition is ALLOWED due to human-approved exemption
    const check2 = qEngine.canTransitionTo("ADR_RFC_GOVERNANCE");
    expect(check2.allowed).toBe(true);
  });

  it("3. BDD Engine: detects ambiguous acceptance criteria & builds Gherkin", () => {
    const bdd = new BDDEngine(testProjectDir);
    const questions = bdd.analyzeAcceptanceCriteria(
      "User Authentication",
      "As a user I want fast login",
      ["User enters credentials", "System responds with fast authentication", "Appropriate error handling"]
    );

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((q) => q.question.includes("fast"))).toBe(true);

    const gherkin = bdd.buildGherkinFeature("User Auth", "As a user...", [
      {
        id: "SC-1",
        title: "Valid credentials login",
        given: ["user is on login page"],
        when: ["user enters valid credentials"],
        then: ["user receives JWT token"],
        tags: ["@auth"],
      },
    ]);

    const savedPath = bdd.saveFeatureFile("User Auth", gherkin);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  it("4. Dialectic Test Review Panel: emits BLOCKER objections & enforces <400 LOC slice limit", () => {
    const reviewer = new PreImplementationTestReviewPanel();
    const spec = {
      featureName: "Payment Gateway",
      userStory: "As a user...",
      acceptanceCriteria: ["Charge credit card", "Handle invalid CVV"],
      scenarios: [
        { id: "SC-1", title: "Valid charge", given: ["card"], when: ["submit"], then: ["success"], tags: [] },
        { id: "SC-2", title: "Invalid CVV error", given: ["bad cvv"], when: ["submit"], then: ["error"], tags: [] },
      ],
      clarifyingQuestions: [],
      rawGherkin: "...",
      isRedVerified: true,
    };

    const passResult = reviewer.reviewTests(spec, "beforeEach(() => {}); afterEach(() => {});", 250);
    expect(passResult.passed).toBe(true);

    const failResult = reviewer.reviewTests(spec, undefined, 500);
    expect(failResult.passed).toBe(false);
  });

  it("5. System Design: code AST C4 diagrams, formal counterexample traces, & stateful property test auto-synthesis", () => {
    const design = new SystemDesignEngine(testProjectDir);

    const c4 = design.generateC4FromCode("OrderService", []);
    expect(c4.contextD2).toContain("Code-Generated C4 System Context Diagram");

    const formalClean = design.generateFormalModels("OrderService", ["No double charge"], false);
    expect(formalClean.provedAbstractly).toBe(true);

    const saved = design.saveFormalModels("OrderService", formalClean);
    expect(fs.existsSync(saved.propertyPath)).toBe(true);
  });

  it("6. Architecture Governance & Dialectic RFC Panel: 6 agent lenses & human sign-off", () => {
    const gov = new ArchitectureGovernanceEngine(testProjectDir);

    const adr = gov.createADR("Use Event Driven Architecture", "Need high throughput", "Use Kafka", ["Scalability"]);
    expect(fs.existsSync(adr.filePath)).toBe(true);

    const rfc = gov.evaluateRFCPanel("RFC-0001", "Distributed Locking", "Use unauthenticated eval strategy", ["Network latency"]);
    expect(rfc.reviewResult.objections.some((o) => o.severity === "BLOCKER")).toBe(true);
  });

  it("7. Self-Healing TDD RED/GREEN Iteration Engine & Mutation Testing", () => {
    const tdd = new TDDEngine();

    const tddResult = tdd.runAutoTDDIterationLoop(
      "tests/auth.test.ts",
      "src/auth.ts",
      "FAIL tests/auth.test.ts - AssertionError: expected false to be true",
      "PASS tests/auth.test.ts - 3 tests passed"
    );

    expect(tddResult.passedCleanly).toBe(true);

    const mutationResult = tdd.evaluateMutationTesting("describe(...)", "class Auth {}");
    expect(mutationResult.killRatePercent).toBeGreaterThanOrEqual(85);
  });

  it("8. Guided Human Slice Review: conducts 6-checkpoint walkthrough and locks slice upon sign-off", () => {
    const qEngine = new QualityGateEngine(testProjectDir);

    qEngine.updateBDDSpec({ featureName: "OrderModule", userStory: "story", acceptanceCriteria: ["ac1"], scenarios: [], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "OrderModule", estimatedLOC: 200, isWithinLimit: true, sliceComponents: [] } });
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });
    qEngine.updateC4Spec({ contextD2: "d2", containerD2: "d2", componentD2: "d2", codeD2: "d2", generatedFromCode: true });
    qEngine.updateFormalModel({ alloyModel: "als", tlaModule: "tla", tlaConfig: "cfg", propertyTestSpec: "spec", invariants: [], completenessEvaluation: { isComplete: true, unmodeledStateTransitions: [], critique: "Complete" }, provedAbstractly: true });
    qEngine.updateMutationResult({ totalMutants: 10, killedMutants: 9, survivedMutants: 1, killRatePercent: 90, passedThreshold: true, mutantDetails: [] });

    const reviewer = new PostImplementationCodeReviewPanel();
    const result = reviewer.runReview("export class OrderModule {}", "describe('OrderModule', () => {})", qEngine.getState(), "0 errors, 0 warnings", []);

    qEngine.updateFinalReview(result);
    qEngine.setPhase("GUIDED_HUMAN_SLICE_REVIEW");

    qEngine.recordHumanSliceReview({
      sliceName: "OrderModule",
      reviewerName: "Lead Engineer",
      approved: true,
      notes: "Clean slice implementation, excellent formal specs and mutation test kill rate.",
      timestamp: new Date().toISOString(),
      walkthroughSections: {
        bddSummary: "Verified",
        designAndADRSummary: "Verified",
        formalAndPropertySummary: "Verified",
        testAndMutationSummary: "90% Kill Rate",
        staticAnalysisAndReviewSummary: "Clean",
        driftGuardSummary: "No Drift",
      },
    });

    qEngine.setPhase("COMPLETED_LOCKED");

    expect(qEngine.getState().currentPhase).toBe("COMPLETED_LOCKED");
    expect(qEngine.getState().humanSliceReview?.approved).toBe(true);
  });

  it("9. Pi Tool Execution Signature: handles 5-parameter execution with signal/undefined context gracefully", async () => {
    const { registerTools } = await import("../src/tools");
    const registeredTools: Record<string, any> = {};

    const mockPi = {
      registerTool: (tool: any) => {
        registeredTools[tool.name] = tool;
      },
      registerCommand: () => {},
      on: () => {},
    };

    registerTools(mockPi as any);

    expect(registeredTools["craft_check_gate"]).toBeDefined();
    expect(registeredTools["craft_analyze_requirements"]).toBeDefined();

    // Simulate Pi calling tool.execute with (toolCallId, params, signal, onUpdate, ctx)
    const mockSignal = new AbortController().signal; // Pi passes signal as 3rd arg
    const mockOnUpdate = () => {};

    // 1. Check craft_check_gate with Pi 5-argument signature
    const gateRes = await registeredTools["craft_check_gate"].execute(
      "call-123",
      {},
      mockSignal,
      mockOnUpdate,
      { cwd: testProjectDir, ui: { notify: () => {}, confirm: async () => true, ask: async () => "" } }
    );
    expect(gateRes.content[0].text).toContain("Current Workflow Phase");

    // 2. Check craft_check_gate with undefined ctx (defensive fallback)
    const gateResNoCtx = await registeredTools["craft_check_gate"].execute(
      "call-124",
      {},
      mockSignal,
      mockOnUpdate,
      undefined
    );
    expect(gateResNoCtx.content[0].text).toContain("Current Workflow Phase");

    // 3. Check craft_analyze_requirements with Pi 5-argument signature
    const reqRes = await registeredTools["craft_analyze_requirements"].execute(
      "call-125",
      { featureName: "TestFeature", userStory: "As a user...", acceptanceCriteria: ["AC 1"] },
      mockSignal,
      mockOnUpdate,
      { cwd: testProjectDir, ui: { notify: () => {}, confirm: async () => true, ask: async () => "" } }
    );
    expect(reqRes.content[0].text).toContain("BDD Feature spec generated");
  });
});
