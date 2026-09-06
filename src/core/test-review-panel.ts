import { BDDFeatureSpec, MultiLensTestReviewResult, SliceDecompositionResult, TestReviewLensScore } from "../types";

export class PreImplementationTestReviewPanel {
  public reviewTests(spec: BDDFeatureSpec, testCode?: string, estimatedLOC: number = 250): MultiLensTestReviewResult {
    const lenses: TestReviewLensScore[] = [];

    // Lens 1: Acceptance Criteria Coverage
    const criteriaCount = spec.acceptanceCriteria.length;
    const scenarioCount = spec.scenarios.length;
    const acCoverageScore = Math.min(100, Math.round((scenarioCount / Math.max(1, criteriaCount)) * 85 + (scenarioCount > 0 ? 15 : 0)));

    lenses.push({
      lens: "ACCEPTANCE_CRITERIA",
      score: acCoverageScore,
      passed: acCoverageScore >= 80,
      critique: `Evaluated ${scenarioCount} scenario(s) against ${criteriaCount} acceptance criteria.`,
      recommendations:
        acCoverageScore < 80
          ? ["Add explicit scenario mappings for each acceptance criterion.", "Ensure every Given-When-Then flow maps to a user requirement."]
          : ["Acceptance criteria coverage meets quality threshold."],
    });

    // Lens 2: Edge Case Coverage
    let edgeCaseScore = 75;
    const edgeCaseKeywords = ["empty", "null", "invalid", "error", "boundary", "overflow", "unauthorized", "timeout"];
    const scenarioText = JSON.stringify(spec.scenarios).toLowerCase() + (testCode || "").toLowerCase();
    const foundKeywords = edgeCaseKeywords.filter((k) => scenarioText.includes(k));
    edgeCaseScore = Math.min(100, 60 + foundKeywords.length * 10);

    lenses.push({
      lens: "EDGE_CASES",
      score: edgeCaseScore,
      passed: edgeCaseScore >= 80,
      critique: `Detected ${foundKeywords.length} edge-case scenario pattern(s): [${foundKeywords.join(", ")}].`,
      recommendations:
        edgeCaseScore < 80
          ? ["Include scenarios for empty inputs, boundary conditions, and invalid data payloads.", "Test failure paths and error response formats."]
          : ["Edge case coverage is robust."],
    });

    // Lens 3: Flakiness Risk
    let flakinessScore = 90;
    const flakyPatterns = ["sleep(", "setTimeout", "Date.now()", "Math.random()", "localhost:8080", "global."];
    const detectedFlaky = flakyPatterns.filter((p) => (testCode || "").includes(p));
    if (detectedFlaky.length > 0) {
      flakinessScore -= detectedFlaky.length * 15;
    }

    lenses.push({
      lens: "FLAKINESS_RISK",
      score: Math.max(0, flakinessScore),
      passed: flakinessScore >= 80,
      critique:
        detectedFlaky.length > 0
          ? `Detected potential flakiness hazards in test code: [${detectedFlaky.join(", ")}].`
          : "No non-deterministic patterns, sleep calls, or shared global state leaks detected.",
      recommendations:
        flakinessScore < 80
          ? ["Replace static sleeps/timeouts with explicit async event polling.", "Use dependency injection for timers and random generators."]
          : ["Flakiness risk is low."],
    });

    // Lens 4: Fixtures & Closures
    let fixtureScore = 85;
    if (testCode) {
      const hasTeardown = testCode.includes("afterEach") || testCode.includes("tearDown") || testCode.includes("cleanUp");
      const hasIsolation = testCode.includes("beforeEach") || testCode.includes("setUp");
      if (!hasTeardown || !hasIsolation) {
        fixtureScore -= 20;
      }
    }

    lenses.push({
      lens: "FIXTURES_AND_CLOSURES",
      score: fixtureScore,
      passed: fixtureScore >= 80,
      critique: "Evaluated setup/teardown hygiene and test fixture closure isolation.",
      recommendations:
        fixtureScore < 80
          ? ["Ensure each test operates on an isolated context via beforeEach reset hooks.", "Clean up temporary files, database connections, and listeners after each run."]
          : ["Fixtures and closures follow solid isolation patterns."],
    });

    // Problem Slice Decomposition (< 400 lines constraint)
    const isWithinLimit = estimatedLOC <= 400;
    const sliceDecomposition: SliceDecompositionResult = {
      sliceName: spec.featureName,
      estimatedLOC,
      isWithinLimit,
      sliceComponents: [`${spec.featureName} Feature Module (${estimatedLOC} LOC target)`],
    };

    const allLensesPassed = lenses.every((l) => l.passed) && isWithinLimit;

    let overallCritique = allLensesPassed
      ? "Multi-lens test review passed! Tests thoroughly cover requirements, edge cases, fixtures, and fit within the <400 LOC slice limit."
      : "Multi-lens test review flagged issues. Address recommendations before proceeding to design and implementation.";

    if (!isWithinLimit) {
      overallCritique += ` CRITICAL: Feature slice exceeds the 400 LOC limit (Estimated ${estimatedLOC} LOC). Decompose into smaller sub-slices.`;
    }

    return {
      passed: allLensesPassed,
      lenses,
      sliceDecomposition,
      overallCritique,
    };
  }
}
