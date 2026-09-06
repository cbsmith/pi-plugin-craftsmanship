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

describe("Pi Craftsmanship Plugin Core Workflow", () => {
  beforeEach(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  it("1. BDD Engine: detects ambiguous acceptance criteria & builds Gherkin", () => {
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
    expect(gherkin).toContain("Feature: User Auth");
  });

  it("2. Test Review Panel: evaluates 4 lenses & enforces <400 LOC slice limit", () => {
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

    // Case A: Within < 400 LOC limit
    const passResult = reviewer.reviewTests(spec, "beforeEach(() => {}); afterEach(() => {});", 250);
    expect(passResult.passed).toBe(true);
    expect(passResult.lenses.length).toBe(4);
    expect(passResult.sliceDecomposition.isWithinLimit).toBe(true);

    // Case B: Exceeds 400 LOC limit
    const failResult = reviewer.reviewTests(spec, undefined, 500);
    expect(failResult.passed).toBe(false);
    expect(failResult.sliceDecomposition.isWithinLimit).toBe(false);
  });

  it("3. System Design: generates C4 D2 diagrams and Alloy & TLA+ formal models", () => {
    const design = new SystemDesignEngine(testProjectDir);
    const c4 = design.generateC4D2Diagrams("OrderService", "Handles order processing");
    expect(c4.contextD2).toContain("# C4 System Context Diagram for OrderService");
    expect(c4.containerD2).toContain("API Gateway Container");

    const c4Path = design.saveC4Diagrams(c4);
    expect(fs.existsSync(c4Path)).toBe(true);

    const formal = design.generateFormalModels("OrderService", ["No double charge invariant"]);
    expect(formal.alloyModel).toContain("sig State");
    expect(formal.tlaModule).toContain("MODULE OrderService");

    const savedFormal = design.saveFormalModels("OrderService", formal);
    expect(fs.existsSync(savedFormal.alloyPath)).toBe(true);
    expect(fs.existsSync(savedFormal.tlaPath)).toBe(true);
  });

  it("4. Architecture Governance: manages ADRs and 6-Lens Agent RFC panel with human review", () => {
    const gov = new ArchitectureGovernanceEngine(testProjectDir);

    const adr = gov.createADR("Use Event Driven Architecture", "Need high throughput", "Use Kafka", ["Scalability"]);
    expect(fs.existsSync(adr.filePath)).toBe(true);
    expect(adr.record.id).toBe("0001");

    const rfc = gov.evaluateRFCPanel("RFC-0001", "Distributed Locking", "Use Redis Redlock", ["Network latency"]);
    expect(rfc.lensReviews.length).toBe(6);
    expect(rfc.status).toBe("PENDING_HUMAN_APPROVAL");
  });

  it("5. TDD Engine & Mutation Testing: verifies RED/GREEN state and >=85% mutant kill rate", () => {
    const tdd = new TDDEngine();

    const redResult = tdd.verifyRedCycle("tests/auth.test.ts", "FAIL tests/auth.test.ts - AssertionError: expected false to be true");
    expect(redResult.redVerified).toBe(true);

    const greenResult = tdd.verifyGreenCycle(redResult, "src/auth.ts", "PASS tests/auth.test.ts - 3 tests passed");
    expect(greenResult.greenVerified).toBe(true);

    const mutationResult = tdd.evaluateMutationTesting("describe(...)", "class Auth {}");
    expect(mutationResult.killRatePercent).toBeGreaterThanOrEqual(85);
    expect(mutationResult.passedThreshold).toBe(true);
  });

  it("6. Post-Implementation 7-Lens Code Review: validates static analysis & 7 quality lenses", () => {
    const qEngine = new QualityGateEngine(testProjectDir);

    // Setup complete prerequisites in state
    qEngine.updateBDDSpec({ featureName: "OrderModule", userStory: "story", acceptanceCriteria: ["ac1"], scenarios: [], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, lenses: [], sliceDecomposition: { sliceName: "OrderModule", estimatedLOC: 200, isWithinLimit: true, sliceComponents: [] }, overallCritique: "Pass" });
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });
    qEngine.updateC4Spec({ contextD2: "d2", containerD2: "d2", componentD2: "d2", codeD2: "d2", isValidD2Syntax: true });
    qEngine.updateFormalModel({ alloyModel: "als", tlaModule: "tla", tlaConfig: "cfg", propertyTestSpec: "spec", invariants: [], provedAbstractly: true });
    qEngine.updateMutationResult({ totalMutants: 10, killedMutants: 9, survivedMutants: 1, killRatePercent: 90, passedThreshold: true, mutantDetails: [] });

    const reviewer = new PostImplementationCodeReviewPanel();
    const result = reviewer.runReview("export class OrderModule {}", "describe('OrderModule', () => {})", qEngine.getState(), "0 errors, 0 warnings");

    expect(result.lenses.length).toBe(7);
    expect(result.passed).toBe(true);
  });
});
