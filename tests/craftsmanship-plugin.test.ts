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

describe("Pi Craftsmanship Plugin Dialectic Workflow & Hard Gates", () => {
  beforeEach(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  it("1. Hard Quality Gates: blocks transition when prerequisite phases are missing", () => {
    const qEngine = new QualityGateEngine(testProjectDir);
    expect(qEngine.getState().hardGateEnforced).toBe(true);

    // Try transitioning to TDD without BDD/Design/ADRs
    const check = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("HARD GATE BLOCKED");
  });

  it("2. BDD Engine: detects ambiguous acceptance criteria & builds Gherkin", () => {
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

  it("3. Dialectic Test Review Panel: emits BLOCKER objections & enforces <400 LOC slice limit", () => {
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

    // Case A: Within < 400 LOC limit and isolated fixtures
    const passResult = reviewer.reviewTests(spec, "beforeEach(() => {}); afterEach(() => {});", 250);
    expect(passResult.passed).toBe(true);
    expect(passResult.objections.length).toBe(0);

    // Case B: Exceeds 400 LOC limit -> Raises BLOCKER objection
    const failResult = reviewer.reviewTests(spec, undefined, 500);
    expect(failResult.passed).toBe(false);
    expect(failResult.objections.some((o) => o.severity === "BLOCKER")).toBe(true);
  });

  it("4. System Design: code AST C4 diagrams, formal counterexample traces, & stateful property test auto-synthesis", () => {
    const design = new SystemDesignEngine(testProjectDir);

    // Code-generated C4 diagrams
    const c4 = design.generateC4FromCode("OrderService", []);
    expect(c4.contextD2).toContain("Code-Generated C4 System Context Diagram");

    // Formal specifications with simulated counterexample trace
    const formalCounterexample = design.generateFormalModels("OrderService", ["No double charge"], true);
    expect(formalCounterexample.counterexample).toBeDefined();
    expect(formalCounterexample.counterexample?.invariantViolated).toBe("NoConcurrentLockViolation");
    expect(formalCounterexample.completenessEvaluation.isComplete).toBe(false);

    // Clean formal specifications & stateful property tests (Idea #5)
    const formalClean = design.generateFormalModels("OrderService", ["No double charge"], false);
    expect(formalClean.provedAbstractly).toBe(true);
    expect(formalClean.propertyTestSpec).toContain("fc.modelRun");

    const saved = design.saveFormalModels("OrderService", formalClean);
    expect(fs.existsSync(saved.propertyPath)).toBe(true);
  });

  it("5. Architecture Governance & Dialectic RFC Panel: 6 agent lenses & human sign-off", () => {
    const gov = new ArchitectureGovernanceEngine(testProjectDir);

    const adr = gov.createADR("Use Event Driven Architecture", "Need high throughput", "Use Kafka", ["Scalability"]);
    expect(fs.existsSync(adr.filePath)).toBe(true);

    const rfc = gov.evaluateRFCPanel("RFC-0001", "Distributed Locking", "Use unauthenticated eval strategy", ["Network latency"]);
    expect(rfc.reviewResult.objections.some((o) => o.severity === "BLOCKER")).toBe(true);
    expect(rfc.status).toBe("DRAFT");
  });

  it("6. Self-Healing TDD RED/GREEN Iteration Engine (Idea #6) & Mutation Testing", () => {
    const tdd = new TDDEngine();

    const tddResult = tdd.runAutoTDDIterationLoop(
      "tests/auth.test.ts",
      "src/auth.ts",
      "FAIL tests/auth.test.ts - AssertionError: expected false to be true",
      "PASS tests/auth.test.ts - 3 tests passed"
    );

    expect(tddResult.passedCleanly).toBe(true);
    expect(tddResult.iterations).toBe(1);

    const mutationResult = tdd.evaluateMutationTesting("describe(...)", "class Auth {}");
    expect(mutationResult.killRatePercent).toBeGreaterThanOrEqual(85);
  });

  it("7. Dialectic Code Review & Architectural Drift Guard: detects undocumented dependency drift", () => {
    const qEngine = new QualityGateEngine(testProjectDir);

    qEngine.updateBDDSpec({ featureName: "OrderModule", userStory: "story", acceptanceCriteria: ["ac1"], scenarios: [], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "OrderModule", estimatedLOC: 200, isWithinLimit: true, sliceComponents: [] } });
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });
    qEngine.updateC4Spec({ contextD2: "d2", containerD2: "d2", componentD2: "d2", codeD2: "d2", generatedFromCode: true });
    qEngine.updateFormalModel({ alloyModel: "als", tlaModule: "tla", tlaConfig: "cfg", propertyTestSpec: "spec", invariants: [], completenessEvaluation: { isComplete: true, unmodeledStateTransitions: [], critique: "Complete" }, provedAbstractly: true });
    qEngine.updateMutationResult({ totalMutants: 10, killedMutants: 9, survivedMutants: 1, killRatePercent: 90, passedThreshold: true, mutantDetails: [] });

    // Create file with undocumented external dependency to trigger Architectural Drift Guard
    const sampleSrcFile = path.join(testProjectDir, "sample.ts");
    fs.writeFileSync(sampleSrcFile, "import axios from 'axios';\nexport class OrderModule {}", "utf-8");

    const reviewer = new PostImplementationCodeReviewPanel();
    const result = reviewer.runReview("export class OrderModule {}", "describe('OrderModule', () => {})", qEngine.getState(), "0 errors, 0 warnings", [sampleSrcFile]);

    expect(result.driftReport.hasDrift).toBe(true);
    expect(result.passed).toBe(false);
  });
});
