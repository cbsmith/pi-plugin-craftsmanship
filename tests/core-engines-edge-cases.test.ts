import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { QualityGateEngine } from "../src/core/state-machine";
import { BDDEngine } from "../src/core/bdd-engine";
import { SystemDesignEngine } from "../src/core/system-design";
import { ArchitectureGovernanceEngine } from "../src/core/architecture-governance";
import { TDDEngine } from "../src/core/tdd-engine";
import { PreImplementationTestReviewPanel } from "../src/core/test-review-panel";
import { PostImplementationCodeReviewPanel } from "../src/core/code-review-panel";

const coreTestDir = path.join(__dirname, "../tmp_core_test_project");

describe("Core Engineering Modules Edge Cases & Robustness", () => {
  beforeEach(() => {
    if (fs.existsSync(coreTestDir)) {
      fs.rmSync(coreTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(coreTestDir, { recursive: true });
  });

  it("1. QualityGateEngine state corruption recovery", () => {
    const craftDir = path.join(coreTestDir, ".craftsmanship");
    fs.mkdirSync(craftDir, { recursive: true });
    fs.writeFileSync(path.join(craftDir, "state.json"), "{ invalid JSON content", "utf-8");

    // Should recover gracefully with clean initial state instead of crashing
    const qEngine = new QualityGateEngine(coreTestDir);
    expect(qEngine.getState().currentPhase).toBe("UNINITIALIZED");
    expect(qEngine.getState().exemptions).toEqual([]);
  });

  it("2. QualityGateEngine exemption filtering and state persistence", () => {
    const qEngine = new QualityGateEngine(coreTestDir);

    qEngine.recordExemption({
      gate: "C4_DIAGRAMS",
      riskAssessment: "Small CSS fix",
      requestedByAgent: true,
      humanApproved: true,
      timestamp: new Date().toISOString(),
    });

    qEngine.recordExemption({
      gate: "FORMAL_METHODS",
      riskAssessment: "Docs update",
      requestedByAgent: true,
      humanApproved: false,
      timestamp: new Date().toISOString(),
    });

    expect(qEngine.hasApprovedExemption("C4_DIAGRAMS")).toBe(true);
    expect(qEngine.hasApprovedExemption("FORMAL_METHODS")).toBe(false);

    // Re-instantiate from disk and verify persistence
    const qEngineDisk = new QualityGateEngine(coreTestDir);
    expect(qEngineDisk.hasApprovedExemption("C4_DIAGRAMS")).toBe(true);
    expect(qEngineDisk.hasApprovedExemption("FORMAL_METHODS")).toBe(false);
  });

  it("3. BDDEngine handles empty criteria and non-ambiguous specs", () => {
    const bdd = new BDDEngine(coreTestDir);
    const questions = bdd.analyzeAcceptanceCriteria("CleanFeature", "User Story", ["Given a user with valid credentials, when they log in, then return 200 OK"]);

    expect(questions).toHaveLength(0);

    const featurePath = bdd.saveFeatureFile("CleanFeature", "Feature: CleanFeature");
    expect(fs.existsSync(featurePath)).toBe(true);
  });

  it("4. SystemDesignEngine AST parsing edge cases for source files", () => {
    const design = new SystemDesignEngine(coreTestDir);
    const srcFile = path.join(coreTestDir, "sample.ts");
    fs.writeFileSync(srcFile, `import { User } from './user';\nexport class AccountService {\n  constructor(private user: User) {}\n}`, "utf-8");

    const c4 = design.generateC4FromCode("AccountSlice", [srcFile]);
    expect(c4.componentD2).toContain("AccountService");
    expect(c4.codeD2).toContain("DomainEntity");
  });

  it("5. ArchitectureGovernanceEngine ADR auto-incrementing", () => {
    const gov = new ArchitectureGovernanceEngine(coreTestDir);
    const adr1 = gov.createADR("First Choice", "Context 1", "Decision 1", ["Consequence 1"]);
    const adr2 = gov.createADR("Second Choice", "Context 2", "Decision 2", ["Consequence 2"]);

    expect(adr1.record.id).toBe("0001");
    expect(adr2.record.id).toBe("0002");
    expect(fs.existsSync(adr1.filePath)).toBe(true);
    expect(fs.existsSync(adr2.filePath)).toBe(true);
  });

  it("6. TDDEngine assertion diff extraction & RED failure validation", () => {
    const tdd = new TDDEngine();

    // Valid RED run where test failed prior to code implementation
    const redRes = tdd.runAutoTDDIterationLoop(
      "tests/user.test.ts",
      "src/user.ts",
      "FAIL tests/user.test.ts\nAssertionError: expected false to be true",
      "PASS tests/user.test.ts"
    );

    expect(redRes.redVerified).toBe(true);
    expect(redRes.greenVerified).toBe(true);
    expect(redRes.passedCleanly).toBe(true);
  });

  it("7. PreImplementationTestReviewPanel enforces problem slice decomposition limit", () => {
    const panel = new PreImplementationTestReviewPanel();
    const bddSpec = {
      featureName: "BigFeature",
      userStory: "Story",
      acceptanceCriteria: ["ac"],
      scenarios: [
        { id: "SC1", title: "s1", given: ["null payload"], when: ["error occurs"], then: ["empty response"], tags: [] }
      ],
      clarifyingQuestions: [],
      rawGherkin: "",
      isRedVerified: true,
    };

    // 500 LOC exceeds 400 LOC limit -> MUST fail review
    const reviewFail = panel.reviewTests(bddSpec, undefined, 500);
    expect(reviewFail.passed).toBe(false);
    expect(reviewFail.objections.some((o) => o.title.includes("Exceeds 400 LOC"))).toBe(true);

    // 250 LOC is within limit -> MUST pass review
    const reviewPass = panel.reviewTests(bddSpec, undefined, 250);
    expect(reviewPass.passed).toBe(true);
  });

  it("8. PostImplementationCodeReviewPanel detects architectural drift", () => {
    const reviewer = new PostImplementationCodeReviewPanel();
    const qEngine = new QualityGateEngine(coreTestDir);

    const srcFile = path.join(coreTestDir, "auth.ts");
    fs.writeFileSync(srcFile, "const client = axios.create(); fetch('https://api.external.com');", "utf-8");

    // Pass C4 diagram that does NOT include external HTTP client
    qEngine.updateC4Spec({
      contextD2: "User -> App",
      containerD2: "App -> DB",
      componentD2: "App -> DB",
      codeD2: "App -> DB",
      generatedFromCode: true,
    });

    const review = reviewer.runReview(
      "export class Auth {}",
      "describe('Auth', () => {})",
      qEngine.getState(),
      "0 errors",
      [srcFile]
    );

    expect(review.driftReport.hasDrift).toBe(true);
    expect(review.driftReport.undocumentedChanges.length).toBeGreaterThan(0);
  });
});
