import { Type } from "@sinclair/typebox";
import { BDDEngine } from "../core/bdd-engine";
import { PreImplementationTestReviewPanel } from "../core/test-review-panel";
import { SystemDesignEngine } from "../core/system-design";
import { ArchitectureGovernanceEngine } from "../core/architecture-governance";
import { TDDEngine } from "../core/tdd-engine";
import { PostImplementationCodeReviewPanel } from "../core/code-review-panel";
import { QualityGateEngine } from "../core/state-machine";
import { ExtensionAPI, ExtensionContext } from "../types";

export function registerTools(pi: ExtensionAPI): void {

  // Tool 1: Analyze Requirements & Generate Gherkin
  pi.registerTool({
    name: "craft_analyze_requirements",
    label: "Craftsmanship: Analyze Requirements & Build Gherkin BDD",
    description: "Parses feature acceptance criteria, identifies ambiguous language, generates clarifying questions, and constructs standard Gherkin .feature specs.",
    parameters: Type.Object({
      featureName: Type.String({ description: "Title of the feature" }),
      userStory: Type.String({ description: "User story (As a... I want... So that...)" }),
      acceptanceCriteria: Type.Array(Type.String(), { description: "List of explicit acceptance criteria" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const bdd = new BDDEngine(ctx.cwd);
      const questions = bdd.analyzeAcceptanceCriteria(params.featureName, params.userStory, params.acceptanceCriteria);

      const sampleScenarios = params.acceptanceCriteria.map((ac: string, idx: number) => ({
        id: `SC-${idx + 1}`,
        title: `Scenario for AC: ${ac}`,
        given: ["the system is initialized with clean state"],
        when: [`the user triggers action for "${ac}"`],
        then: ["the system responds in accordance with acceptance criteria"],
        tags: ["@acceptance"],
      }));

      const gherkin = bdd.buildGherkinFeature(params.featureName, params.userStory, sampleScenarios);
      const filePath = bdd.saveFeatureFile(params.featureName, gherkin);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.updateBDDSpec({
        featureName: params.featureName,
        userStory: params.userStory,
        acceptanceCriteria: params.acceptanceCriteria,
        scenarios: sampleScenarios,
        clarifyingQuestions: questions,
        rawGherkin: gherkin,
      });
      qEngine.setPhase("BDD_SPECIFICATION");

      let summary = `BDD Feature spec generated at ${filePath}\n\n`;
      if (questions.length > 0) {
        summary += `ATTENTION: ${questions.length} clarifying question(s) identified:\n`;
        questions.forEach((q) => (summary += `- [${q.id}] ${q.question}\n`));
      } else {
        summary += "Acceptance criteria are clear and unambiguous!";
      }

      return { content: [{ type: "text", text: summary }] };
    },
  });

  // Tool 2: Pre-Implementation Multi-Lens Test Review & Slice Decomposition Check
  pi.registerTool({
    name: "craft_review_tests",
    label: "Craftsmanship: Multi-Lens Pre-Implementation Test Review",
    description: "Critiques BDD & test suites across 4 lenses (Acceptance Criteria, Edge Cases, Flakiness, Fixtures/Closures) and verifies slice decomposition (<400 LOC).",
    parameters: Type.Object({
      estimatedLOC: Type.Number({ description: "Target LOC for this problem slice (must be <400)", default: 250 }),
      testCode: Type.Optional(Type.String({ description: "Optional raw test file code content for static inspection" })),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      if (!state.bddSpec) {
        return { content: [{ type: "text", text: "ERROR: BDD Feature Spec must be created first before running test review." }] };
      }

      const reviewer = new PreImplementationTestReviewPanel();
      const reviewResult = reviewer.reviewTests(state.bddSpec, params.testCode, params.estimatedLOC);

      qEngine.updateTestReview(reviewResult);
      if (reviewResult.passed) {
        qEngine.setPhase("MULTI_LENS_TEST_REVIEW");
      }

      let report = `## Pre-Implementation Test Review Report\n`;
      report += `**Overall Status**: ${reviewResult.passed ? "PASSED" : "FAILED"}\n\n`;
      report += `### 4 Lens Critiques:\n`;
      reviewResult.lenses.forEach((l) => {
        report += `- **${l.lens}**: Score ${l.score}/100 [${l.passed ? "PASS" : "FAIL"}]\n  Critique: ${l.critique}\n`;
        if (l.recommendations.length > 0) {
          l.recommendations.forEach((r) => (report += `  - Rec: ${r}\n`));
        }
      });
      report += `\n### Problem Slice Decomposition:\n`;
      report += `- Slice LOC: ${reviewResult.sliceDecomposition.estimatedLOC} lines (Limit: <400 LOC) -> ${reviewResult.sliceDecomposition.isWithinLimit ? "WITHIN LIMIT" : "EXCEEDED LIMIT"}\n`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 3: Generate C4 Architecture Diagrams in D2
  pi.registerTool({
    name: "craft_generate_c4_d2",
    label: "Craftsmanship: Generate C4 D2 Diagrams",
    description: "Constructs Context, Container, Component, and Code level C4 architecture diagrams formatted in D2 syntax.",
    parameters: Type.Object({
      sliceName: Type.String({ description: "Name of system slice" }),
      description: Type.String({ description: "Architectural purpose" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const design = new SystemDesignEngine(ctx.cwd);
      const c4 = design.generateC4D2Diagrams(params.sliceName, params.description);
      const filePath = design.saveC4Diagrams(c4);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.updateC4Spec(c4);

      return { content: [{ type: "text", text: `C4 D2 diagrams successfully generated and saved to ${filePath}` }] };
    },
  });

  // Tool 4: Generate Formal Specifications (Alloy & TLA+)
  pi.registerTool({
    name: "craft_generate_formal_spec",
    label: "Craftsmanship: Formal Methods Modeling (Alloy & TLA+)",
    description: "Generates declarative relational models in Alloy (.als), concurrent state machine specs in TLA+ (.tla/.cfg), and property-based test suites.",
    parameters: Type.Object({
      sliceName: Type.String({ description: "Name of system slice" }),
      invariants: Type.Array(Type.String(), { description: "Safety & liveness state invariants to prove" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const design = new SystemDesignEngine(ctx.cwd);
      const model = design.generateFormalModels(params.sliceName, params.invariants);
      const saved = design.saveFormalModels(params.sliceName, model);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.updateFormalModel(model);
      qEngine.setPhase("SYSTEM_DESIGN_C4_FORMAL");

      const text = `Formal Methods specifications created:\n- Alloy model: ${saved.alloyPath}\n- TLA+ specification: ${saved.tlaPath}\n- Invariants to prove: ${model.invariants.join(", ")}`;
      return { content: [{ type: "text", text }] };
    },
  });

  // Tool 5: Create ADR
  pi.registerTool({
    name: "craft_create_adr",
    label: "Craftsmanship: Record Architectural Decision (ADR)",
    description: "Creates a MADR architecture decision record in docs/adr/.",
    parameters: Type.Object({
      title: Type.String({ description: "ADR title" }),
      context: Type.String({ description: "Context and problem statement" }),
      decision: Type.String({ description: "Architectural decision outcome" }),
      consequences: Type.Array(Type.String(), { description: "Positive consequences" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const gov = new ArchitectureGovernanceEngine(ctx.cwd);
      const { record, filePath } = gov.createADR(params.title, params.context, params.decision, params.consequences);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.addADR(record);

      return { content: [{ type: "text", text: `ADR #${record.id} created at ${filePath}` }] };
    },
  });

  // Tool 6: Run RFC Panel (6 Lenses + Human Review Solicitation)
  pi.registerTool({
    name: "craft_run_rfc_panel",
    label: "Craftsmanship: 6-Lens Agent RFC Review & Human Sign-off",
    description: "Evaluates challenging architectural strategies across 6 agent lenses (Security, Consistency, Efficiency, Simplicity, Maintainability, Elegance) and prompts for human sign-off.",
    parameters: Type.Object({
      rfcId: Type.String({ description: "RFC identifier (e.g. RFC-0001)" }),
      title: Type.String({ description: "RFC title" }),
      strategyDescription: Type.String({ description: "Detailed strategy description" }),
      tradeOffs: Type.Array(Type.String(), { description: "Known trade-offs" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const gov = new ArchitectureGovernanceEngine(ctx.cwd);
      const rfc = gov.evaluateRFCPanel(params.rfcId, params.title, params.strategyDescription, params.tradeOffs);
      const filePath = gov.saveRFC(rfc);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.addOrUpdateRFC(rfc);
      qEngine.setPhase("ADR_RFC_GOVERNANCE");

      let report = `## RFC ${rfc.id} Multi-Lens Review Panel Results\n`;
      report += `**Saved File**: ${filePath}\n`;
      report += `**Status**: ${rfc.status}\n\n`;
      report += `### 6-Lens Agent Critique:\n`;
      rfc.lensReviews.forEach((l) => {
        report += `- **${l.lens}** (${l.reviewer}): Score ${l.score}/100 -> ${l.approvalGranted ? "APPROVED" : "REJECTED"}\n  Critique: ${l.critique}\n`;
      });
      report += `\n### HUMAN REVIEW REQUIRED:\n`;
      report += `All 6 agent lenses have completed their evaluation. Human approval is required before code implementation can begin. Run /craft-rfc approve ${rfc.id} to sign off.`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 7: Verify TDD RED Cycle
  pi.registerTool({
    name: "craft_verify_tdd_red",
    label: "Craftsmanship: Verify TDD RED Failure State",
    description: "Runs unit test suite or inspects execution log to confirm tests cleanly fail (RED) before implementation code is written.",
    parameters: Type.Object({
      unitTestFilePath: Type.String({ description: "Path to unit test file" }),
      executionOutput: Type.String({ description: "Raw test runner stdout/stderr output" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const tdd = new TDDEngine();
      const state = tdd.verifyRedCycle(params.unitTestFilePath, params.executionOutput);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.addTDDCycle(state);
      if (state.redVerified) {
        qEngine.setPhase("TDD_UNIT_RED_GREEN");
      }

      return {
        content: [
          {
            type: "text",
            text: state.redVerified
              ? `TDD RED CYCLE VERIFIED: Tests at ${params.unitTestFilePath} failed as expected prior to code implementation.`
              : `TDD RED CYCLE REJECTED: Tests did not fail properly on assertions. Fix test logic before implementing code.`,
          },
        ],
      };
    },
  });

  // Tool 8: Run Mutation Testing
  pi.registerTool({
    name: "craft_run_mutation_tests",
    label: "Craftsmanship: Execute Mutation Testing",
    description: "Runs mutation test analysis against unit test suite and asserts >= 85% mutant kill rate threshold.",
    parameters: Type.Object({
      testCode: Type.String({ description: "Unit test code" }),
      implCode: Type.String({ description: "Implementation code" }),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const tdd = new TDDEngine();
      const result = tdd.evaluateMutationTesting(params.testCode, params.implCode);

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.updateMutationResult(result);
      if (result.passedThreshold) {
        qEngine.setPhase("MUTATION_TESTING");
      }

      let report = `## Mutation Testing Report\n`;
      report += `- **Total Mutants**: ${result.totalMutants}\n`;
      report += `- **Killed Mutants**: ${result.killedMutants}\n`;
      report += `- **Survived Mutants**: ${result.survivedMutants}\n`;
      report += `- **Mutant Kill Rate**: ${result.killRatePercent}% (Threshold: >=85%)\n`;
      report += `- **Gate Status**: ${result.passedThreshold ? "PASSED" : "FAILED"}\n`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 9: Run Post-Implementation 7-Lens Code Review
  pi.registerTool({
    name: "craft_run_code_review",
    label: "Craftsmanship: 7-Lens Post-Implementation Code Review",
    description: "Evaluates implementation against static analysis diagnostics and 7 quality lenses (Security, Simplicity, Efficiency, Adherence, Test Quality, Elegance, Consistency).",
    parameters: Type.Object({
      codeContent: Type.String({ description: "Implementation code" }),
      testContent: Type.String({ description: "Test code" }),
      staticAnalysisOutput: Type.Optional(Type.String({ description: "Static analysis / compiler linter output" })),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      const reviewer = new PostImplementationCodeReviewPanel();
      const result = reviewer.runReview(params.codeContent, params.testContent, state, params.staticAnalysisOutput);

      qEngine.updateFinalReview(result);
      if (result.passed) {
        qEngine.setPhase("COMPLETED_LOCKED");
      }

      let report = `## Post-Implementation 7-Lens Code Review Report\n`;
      report += `**Overall Result**: ${result.passed ? "APPROVED & PASSED" : "REJECTED"}\n\n`;
      report += `### Static Analysis Diagnostics:\n`;
      report += `- Type Errors: ${result.staticAnalysis.typeErrors}\n`;
      report += `- Lint Errors: ${result.staticAnalysis.lintErrors}\n\n`;
      report += `### 7 Lens Critiques:\n`;
      result.lenses.forEach((l) => {
        report += `- **${l.lens}**: Score ${l.score}/100 [${l.passed ? "PASS" : "FAIL"}]\n  Critique: ${l.critique}\n`;
        if (l.actionItems.length > 0) {
          l.actionItems.forEach((a) => (report += `  - Action: ${a}\n`));
        }
      });
      report += `\n**Summary**: ${result.summary}`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 10: Check Quality Gate Status
  pi.registerTool({
    name: "craft_check_gate",
    label: "Craftsmanship: Check Workflow Quality Gate Status",
    description: "Returns the current craftsmanship workflow phase and checks transition eligibility to the next target phase.",
    parameters: Type.Object({
      targetPhase: Type.Optional(Type.String({ description: "Target phase to test transition against" })),
    }),
    execute: async (_id: string, params: any, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      let output = `Current Workflow Phase: ${state.currentPhase}\nSlice Name: ${state.sliceName}\n`;
      if (params.targetPhase) {
        const check = qEngine.canTransitionTo(params.targetPhase as any);
        output += `Transition Check to '${params.targetPhase}': ${check.allowed ? "ALLOWED" : `BLOCKED (${check.reason})`}`;
      }

      return { content: [{ type: "text", text: output }] };
    },
  });
}
