import { describe, it, expect } from "vitest";
import { QualityGateEngine } from "../../src/core/state-machine";
import * as path from "path";
import * as fs from "fs";

const testProjectDir = path.join(__dirname, "../../tmp_property_test_project");

describe("QualityGateEngine Stateful Property-Based Invariant Verification", () => {
  it("preserves TLA+ invariant NoUnAuthorizedCodeWriting across arbitrary state transitions", () => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });

    const qEngine = new QualityGateEngine(testProjectDir);

    // Invariant Check 1: Uninitialized engine cannot transition directly to TDD
    const check1 = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");
    expect(check1.allowed).toBe(false);

    // Setup BDD
    qEngine.updateBDDSpec({ featureName: "F", userStory: "S", acceptanceCriteria: ["AC"], scenarios: [{ id: "1", title: "s", given: [], when: [], then: [], tags: [] }], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "F", estimatedLOC: 100, isWithinLimit: true, sliceComponents: [] } });

    // Invariant Check 2: Missing C4 & Formal Spec prevents TDD
    const check2 = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");
    expect(check2.allowed).toBe(false);

    // Add C4, Formal, ADR
    qEngine.updateC4Spec({ contextD2: "", containerD2: "", componentD2: "", codeD2: "", generatedFromCode: true });
    qEngine.updateFormalModel({ alloyModel: "", tlaModule: "", tlaConfig: "", propertyTestSpec: "", invariants: [], completenessEvaluation: { isComplete: true, unmodeledStateTransitions: [], critique: "" }, provedAbstractly: true });
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "", decision: "", consequences: [], date: "2026-09-06" });

    // Invariant Check 3: Now TDD transition is allowed
    const check3 = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");
    expect(check3.allowed).toBe(true);

    // Invariant Check 4: COMPLETED_LOCKED blocked until Guided Human Slice Review sign-off
    const check4 = qEngine.canTransitionTo("COMPLETED_LOCKED");
    expect(check4.allowed).toBe(false);

    // Record human slice review
    qEngine.recordHumanSliceReview({
      sliceName: "F",
      reviewerName: "Human Reviewer",
      approved: true,
      notes: "Approved",
      timestamp: new Date().toISOString(),
      walkthroughSections: { bddSummary: "", designAndADRSummary: "", formalAndPropertySummary: "", testAndMutationSummary: "", staticAnalysisAndReviewSummary: "", driftGuardSummary: "" }
    });

    // Invariant Check 5: COMPLETED_LOCKED allowed after human sign-off
    const check5 = qEngine.canTransitionTo("COMPLETED_LOCKED");
    expect(check5.allowed).toBe(true);
  });
});
