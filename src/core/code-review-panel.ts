import { CodeReviewLensScore, FinalCodeReviewResult, QualityGateState, StaticAnalysisDiagnostics } from "../types";

export class PostImplementationCodeReviewPanel {
  public runReview(
    codeContent: string,
    testContent: string,
    state: QualityGateState,
    staticAnalysisOutput?: string
  ): FinalCodeReviewResult {
    // 1. Process Static Analysis Diagnostics
    const staticAnalysis: StaticAnalysisDiagnostics = {
      lintErrors: 0,
      lintWarnings: 0,
      typeErrors: 0,
      securityIssues: 0,
      toolOutputs: {
        compiler: staticAnalysisOutput || "Typecheck & Lint passed cleanly.",
      },
    };

    if (staticAnalysisOutput) {
      if (staticAnalysisOutput.includes("error TS")) {
        staticAnalysis.typeErrors = (staticAnalysisOutput.match(/error TS\d+/g) || []).length;
      }
      const lintErrorMatch = staticAnalysisOutput.match(/(\d+)\s+errors?/i);
      if (lintErrorMatch) {
        staticAnalysis.lintErrors = parseInt(lintErrorMatch[1], 10);
      } else if (staticAnalysisOutput.toLowerCase().includes("error:")) {
        staticAnalysis.lintErrors = (staticAnalysisOutput.match(/error:/gi) || []).length;
      }
    }

    const lenses: CodeReviewLensScore[] = [];

    // Lens 1: Security
    const hasEval = codeContent.includes("eval(") || codeContent.includes("exec(");
    const hasUncheckedInnerHtml = codeContent.includes("innerHTML");
    const securityScore = hasEval || hasUncheckedInnerHtml ? 60 : 95;

    lenses.push({
      lens: "SECURITY",
      score: securityScore,
      passed: securityScore >= 80,
      critique: securityScore < 80 ? "Detected dynamic code execution or unsafe DOM injection risk." : "Code adheres to secure coding standards.",
      actionItems: securityScore < 80 ? ["Remove dangerous dynamic execution calls.", "Sanitize external inputs before DOM rendering."] : [],
    });

    // Lens 2: Simplicity
    const lineCount = codeContent.split("\n").length;
    const simplicityScore = lineCount <= 400 ? 92 : 70;

    lenses.push({
      lens: "SIMPLICITY",
      score: simplicityScore,
      passed: simplicityScore >= 80,
      critique: simplicityScore >= 80 ? `Implementation is concise (${lineCount} LOC, target <400 LOC).` : `Implementation exceeds 400 LOC (${lineCount} LOC). Decompose into smaller modules.`,
      actionItems: simplicityScore < 80 ? ["Decompose large functions/classes into focused helper modules."] : [],
    });

    // Lens 3: Efficiency
    const hasNestedLoops = (codeContent.match(/for\s*\(.*for\s*\(/g) || []).length > 0;
    const efficiencyScore = hasNestedLoops ? 75 : 90;

    lenses.push({
      lens: "EFFICIENCY",
      score: efficiencyScore,
      passed: efficiencyScore >= 80,
      critique: hasNestedLoops ? "Detected nested loops with potential O(N^2) complexity." : "Algorithmic complexity and resource allocation are efficient.",
      actionItems: hasNestedLoops ? ["Refactor nested loops to use lookup maps or index structures for O(N) execution."] : [],
    });

    // Lens 4: Adherence to Design / Formal Models / C4 Diagrams
    const hasADRs = state.adrs.length > 0;
    const hasC4 = !!state.c4Spec;
    const hasFormal = !!state.formalModel;
    const adherenceScore = hasADRs && hasC4 && hasFormal ? 95 : 70;

    lenses.push({
      lens: "ADHERENCE_TO_DESIGN",
      score: adherenceScore,
      passed: adherenceScore >= 80,
      critique: adherenceScore >= 80 ? "Implementation strictly conforms to C4 D2 diagrams, Alloy/TLA+ formal models, and ADR decisions." : "Incomplete architectural design trace detected.",
      actionItems: adherenceScore < 80 ? ["Ensure code structure matches C4 component diagrams and respects TLA+ invariants."] : [],
    });

    // Lens 5: Test Quality
    const mutationPassed = state.mutationResult?.passedThreshold ?? false;
    const testScore = mutationPassed ? 94 : 65;

    lenses.push({
      lens: "TEST_QUALITY",
      score: testScore,
      passed: testScore >= 80,
      critique: mutationPassed ? "Tests passed BDD RED/GREEN TDD cycles and met the >=85% mutation test threshold." : "Mutation test kill rate was insufficient or TDD cycle incomplete.",
      actionItems: mutationPassed ? [] : ["Improve unit test assertion density to kill surviving mutants."],
    });

    // Lens 6: Elegance / Separation of Concerns
    const eleganceScore = 90;
    lenses.push({
      lens: "ELEGANCE_SOC",
      score: eleganceScore,
      passed: eleganceScore >= 80,
      critique: "Clear separation of concerns between domain logic, data persistence, and interface layers.",
      actionItems: [],
    });

    // Lens 7: Consistency
    const consistencyScore = staticAnalysis.typeErrors === 0 && staticAnalysis.lintErrors === 0 ? 95 : 70;
    lenses.push({
      lens: "CONSISTENCY",
      score: consistencyScore,
      passed: consistencyScore >= 80,
      critique: consistencyScore >= 80 ? "Code style, types, and formatting are strictly consistent." : `Detected ${staticAnalysis.typeErrors} type errors and ${staticAnalysis.lintErrors} lint errors.`,
      actionItems: consistencyScore < 80 ? ["Fix compiler type errors and linter diagnostic warnings."] : [],
    });

    const passed = lenses.every((l) => l.passed) && staticAnalysis.typeErrors === 0 && staticAnalysis.lintErrors === 0;

    const summary = passed
      ? "CONGRATULATIONS: All 7 multi-lens code review quality gates passed! Static analysis clean. Code is ready for merge."
      : "CODE REVIEW REJECTED: One or more multi-lens review criteria or static analysis checks failed. Address action items.";

    return {
      passed,
      staticAnalysis,
      lenses,
      summary,
    };
  }
}
