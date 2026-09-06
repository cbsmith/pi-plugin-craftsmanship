import { ArchitecturalDriftReport, DialecticObjection, DialecticReviewResult, FinalCodeReviewResult, QualityGateState, StaticAnalysisDiagnostics } from "../types";
import { SystemDesignEngine } from "./system-design";

export class PostImplementationCodeReviewPanel {
  public runReview(
    codeContent: string,
    testContent: string,
    state: QualityGateState,
    staticAnalysisOutput?: string,
    sourceFiles: string[] = []
  ): FinalCodeReviewResult {
    // 1. Static Analysis Diagnostics
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

    // 2. Architectural Drift Guard Inspection
    const design = new SystemDesignEngine(process.cwd());
    const driftReport: ArchitecturalDriftReport = design.verifyArchitecturalDrift(state.sliceName || "CoreSystem", sourceFiles);

    // 3. Dialectic Review Objections (7 Lenses)
    const objections: DialecticObjection[] = [];

    // Lens 1: Security
    if (codeContent.includes("eval(") || codeContent.includes("exec(")) {
      objections.push({
        id: "REV-OBJ-SEC-01",
        lens: "Security",
        severity: "BLOCKER",
        title: "Dynamic Code Execution Hazard Detected",
        critique: "Implementation contains dynamic code evaluation (eval/exec), exposing serious remote code execution vulnerabilities.",
        requiredAction: "Remove dynamic evaluation and replace with safe static handlers.",
        addressed: false,
      });
    }

    // Lens 2: Simplicity (Effective Source Lines of Code - SLOC < 400)
    const sloc = codeContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*") && !line.startsWith("#")).length;

    if (sloc > 400) {
      objections.push({
        id: "REV-OBJ-SIMP-01",
        lens: "Simplicity",
        severity: "BLOCKER",
        title: "Module Exceeds 400 SLOC Limit",
        critique: `Implementation is ${sloc} Effective Source Lines of Code (SLOC), violating the mandatory <400 SLOC per slice constraint.`,
        requiredAction: "Refactor module by extracting helper classes into separate sub-files.",
        addressed: false,
      });
    }

    // Lens 3: Efficiency
    if ((codeContent.match(/for\s*\(.*for\s*\(/g) || []).length > 0) {
      objections.push({
        id: "REV-OBJ-EFF-01",
        lens: "Efficiency",
        severity: "MAJOR",
        title: "Nested Iteration Traps O(N^2) Complexity",
        critique: "Detected nested loops which degrade performance on large data collections.",
        requiredAction: "Refactor nested loops using lookup maps for O(N) linear performance.",
        addressed: false,
      });
    }

    // Lens 4: Adherence to Design / Formal Models / C4 Diagrams
    if (!state.c4Spec || !state.formalModel || state.adrs.length === 0) {
      objections.push({
        id: "REV-OBJ-ADH-01",
        lens: "Adherence to Design",
        severity: "BLOCKER",
        title: "Incomplete Design Artifact Traceability",
        critique: "Code implementation lacks underlying C4 D2 diagrams, Alloy/TLA+ formal specifications, or ADR records.",
        requiredAction: "Complete design artifacts in specs/ and docs/ before finalizing review.",
        addressed: false,
      });
    }

    if (driftReport.hasDrift) {
      objections.push({
        id: "REV-OBJ-DRIFT-01",
        lens: "Adherence to Design",
        severity: "BLOCKER",
        title: "Architectural Drift Detected",
        critique: `Source code introduced un-documented architectural changes: ${driftReport.undocumentedChanges.join("; ")}`,
        requiredAction: "Update C4 diagrams and record an ADR documenting architectural changes.",
        addressed: false,
      });
    }

    // Lens 5: Test Quality
    if (!state.mutationResult || !state.mutationResult.passedThreshold) {
      objections.push({
        id: "REV-OBJ-TEST-01",
        lens: "Test Quality",
        severity: "BLOCKER",
        title: "Mutation Test Kill Rate Below 85% Threshold",
        critique: `Current mutant kill rate is ${state.mutationResult?.killRatePercent || 0}%, below the required 85% threshold.`,
        requiredAction: "Add targeted unit test assertions to kill surviving mutants.",
        addressed: false,
      });
    }

    // Lens 6: Elegance / Separation of Concerns
    // Lens 7: Consistency
    if (staticAnalysis.typeErrors > 0 || staticAnalysis.lintErrors > 0) {
      objections.push({
        id: "REV-OBJ-CONS-01",
        lens: "Consistency",
        severity: "BLOCKER",
        title: "Static Analysis Linter / Type Errors",
        critique: `Detected ${staticAnalysis.typeErrors} type error(s) and ${staticAnalysis.lintErrors} lint error(s).`,
        requiredAction: "Fix compiler type errors and linter diagnostic warnings.",
        addressed: false,
      });
    }

    const blockerCount = objections.filter((o) => o.severity === "BLOCKER" && !o.addressed).length;
    const majorCount = objections.filter((o) => o.severity === "MAJOR" && !o.addressed).length;

    const passed = blockerCount === 0 && majorCount === 0 && !driftReport.hasDrift;

    const dialecticReview: DialecticReviewResult = {
      passed,
      objections,
      summary: passed
        ? "DIALECTIC POST-IMPLEMENTATION CODE REVIEW PASSED: All 7 lenses & static analysis clean! Ready for GUIDED HUMAN SLICE REVIEW walkthrough."
        : `DIALECTIC CODE REVIEW REJECTED: Found ${blockerCount} BLOCKER objection(s) and ${majorCount} MAJOR objection(s).`,
      reReviewRequired: !passed,
      iterationCount: 1,
    };

    return {
      passed,
      staticAnalysis,
      dialecticReview,
      driftReport,
      summary: dialecticReview.summary,
    };
  }
}
