import { BDDFeatureSpec, DialecticObjection, DialecticReviewResult, SliceDecompositionResult } from "../types";

export class PreImplementationTestReviewPanel {
  public reviewTests(
    spec: BDDFeatureSpec,
    testCode?: string,
    estimatedLOC: number = 250,
    previousObjections: DialecticObjection[] = []
  ): DialecticReviewResult & { sliceDecomposition: SliceDecompositionResult } {
    const objections: DialecticObjection[] = [];

    // Lens 1: Acceptance Criteria Coverage Dialectic Review
    const criteriaCount = spec.acceptanceCriteria.length;
    const scenarioCount = spec.scenarios.length;
    if (scenarioCount < criteriaCount) {
      objections.push({
        id: "OBJ-AC-01",
        lens: "Acceptance Criteria",
        severity: "BLOCKER",
        title: "Incomplete Acceptance Criteria Scenario Mapping",
        critique: `Only ${scenarioCount} scenario(s) defined for ${criteriaCount} acceptance criteria. Every acceptance criterion must map to an explicit Given-When-Then test flow.`,
        requiredAction: "Add explicit BDD scenarios for all missing acceptance criteria.",
        addressed: false,
      });
    }

    // Lens 2: Edge Case Coverage Dialectic Review
    const edgeKeywords = ["empty", "null", "invalid", "error", "boundary", "overflow", "unauthorized", "timeout"];
    const text = JSON.stringify(spec.scenarios).toLowerCase() + (testCode || "").toLowerCase();
    const foundKeywords = edgeKeywords.filter((k) => text.includes(k));

    if (foundKeywords.length < 2) {
      objections.push({
        id: "OBJ-EDGE-01",
        lens: "Edge Cases",
        severity: "MAJOR",
        title: "Insufficient Edge Case Test Scenarios",
        critique: `Detected only ${foundKeywords.length} edge-case patterns (${foundKeywords.join(", ") || "none"}). Edge cases for null payloads, boundary conditions, and invalid inputs are missing.`,
        requiredAction: "Add test scenarios covering null/empty inputs and error response codes.",
        addressed: false,
      });
    }

    // Lens 3: Flakiness Risk Dialectic Review
    if (testCode) {
      const flakyPatterns = [
        { pattern: "sleep(", reason: "Static sleep calls introduce non-deterministic timing flakiness." },
        { pattern: "setTimeout", reason: "Async setTimeout calls lead to race condition flakiness." },
        { pattern: "Math.random()", reason: "Unseeded random generators break test reproducibility." },
        { pattern: "localhost:", reason: "Hardcoded network endpoints introduce environmental test failure risks." },
      ];

      flakyPatterns.forEach((fp, idx) => {
        if (testCode.includes(fp.pattern)) {
          objections.push({
            id: `OBJ-FLAKE-${idx + 1}`,
            lens: "Flakiness Risk",
            severity: "BLOCKER",
            title: `Potential Test Flakiness Hazard: '${fp.pattern}'`,
            critique: fp.reason,
            requiredAction: `Remove '${fp.pattern}' call and replace with deterministic event polling or mock stubs.`,
            addressed: false,
          });
        }
      });
    }

    // Lens 4: Fixtures & Closures Dialectic Review
    if (testCode) {
      const hasTeardown = testCode.includes("afterEach") || testCode.includes("tearDown") || testCode.includes("cleanUp");
      const hasSetup = testCode.includes("beforeEach") || testCode.includes("setUp");
      if (!hasTeardown || !hasSetup) {
        objections.push({
          id: "OBJ-FIXTURE-01",
          lens: "Fixtures and Closures",
          severity: "MAJOR",
          title: "Missing Fixture Lifecycle Reset Hooks",
          critique: "Test suite lacks explicit setup/teardown reset hooks (beforeEach/afterEach), raising shared state leakage risks.",
          requiredAction: "Add explicit setup and teardown fixture hooks to guarantee test isolation.",
          addressed: false,
        });
      }
    }

    // Problem Slice Decomposition (< 400 lines constraint)
    const isWithinLimit = estimatedLOC <= 400;
    if (!isWithinLimit) {
      objections.push({
        id: "OBJ-SLICE-01",
        lens: "Slice Decomposition",
        severity: "BLOCKER",
        title: "Slice Exceeds 400 LOC Quality Constraint",
        critique: `Target slice size is estimated at ${estimatedLOC} lines of code, exceeding the mandatory <400 LOC per slice limit. Large slices increase bug density and complicate formal verification.`,
        requiredAction: `Decompose '${spec.featureName}' into smaller sub-slices of <400 LOC each.`,
        addressed: false,
      });
    }

    // Check previous objections resolution state
    previousObjections.forEach((prev) => {
      if (prev.addressed && !objections.some((o) => o.id === prev.id)) {
        // Preserved as addressed
      }
    });

    const blockerCount = objections.filter((o) => o.severity === "BLOCKER" && !o.addressed).length;
    const majorCount = objections.filter((o) => o.severity === "MAJOR" && !o.addressed).length;
    const passed = blockerCount === 0 && majorCount === 0 && isWithinLimit;

    const sliceDecomposition: SliceDecompositionResult = {
      sliceName: spec.featureName,
      estimatedLOC,
      isWithinLimit,
      sliceComponents: [`${spec.featureName} Module (${estimatedLOC} LOC target)`],
    };

    let summary = passed
      ? "DIALECTIC TEST REVIEW PASSED: 0 BLOCKER and 0 MAJOR objections remaining. Slice is within <400 LOC limit."
      : `DIALECTIC TEST REVIEW REJECTED: Found ${blockerCount} BLOCKER objection(s) and ${majorCount} MAJOR objection(s). Address objections to proceed to design stage.`;

    return {
      passed,
      objections,
      summary,
      reReviewRequired: !passed,
      iterationCount: 1,
      sliceDecomposition,
    };
  }
}
