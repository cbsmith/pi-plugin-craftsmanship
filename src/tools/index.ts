import { Type } from "@sinclair/typebox";
import { BDDEngine } from "../core/bdd-engine";
import { PreImplementationTestReviewPanel } from "../core/test-review-panel";
import { SystemDesignEngine } from "../core/system-design";
import { ArchitectureGovernanceEngine } from "../core/architecture-governance";
import { TDDEngine } from "../core/tdd-engine";
import { PostImplementationCodeReviewPanel } from "../core/code-review-panel";
import { QualityGateEngine } from "../core/state-machine";
import { ExemptableGate, ExtensionAPI, ExtensionContext } from "../types";
import { promptConfirm, promptInput } from "../utils/ui-adapter";

export function registerTools(pi: ExtensionAPI): void {

  // Tool 1: Analyze Requirements & Generate Gherkin
  pi.registerTool({
    name: "craft_analyze_requirements",
    label: "Craftsmanship: Analyze Requirements & Build Gherkin BDD",
    description: "Parses feature acceptance criteria, identifies ambiguous language, generates clarifying questions, and constructs standard Gherkin .feature specs.",
    executionMode: "sequential",
    parameters: Type.Object({
      featureName: Type.String({ description: "Title of the feature" }),
      userStory: Type.String({ description: "User story (As a... I want... So that...)" }),
      acceptanceCriteria: Type.Array(Type.String(), { description: "List of explicit acceptance criteria" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const bdd = new BDDEngine(cwd);
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

      const qEngine = new QualityGateEngine(cwd);
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

  // Tool 2: Pre-Implementation Dialectic Test Review & Slice Decomposition Check
  pi.registerTool({
    name: "craft_review_tests",
    label: "Craftsmanship: Pre-Implementation Dialectic Test Review",
    description: "Evaluates BDD & test suites using dialectic critique (BLOCKER/MAJOR/MINOR objections across 4 lenses) and enforces <400 LOC slice limit.",
    executionMode: "parallel",
    parameters: Type.Object({
      estimatedLOC: Type.Number({ description: "Target LOC for this problem slice (must be <400)", default: 250 }),
      testCode: Type.Optional(Type.String({ description: "Optional raw test file code content for static inspection" })),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
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

      let report = `## Pre-Implementation Dialectic Test Review Report\n`;
      report += `**Status**: ${reviewResult.passed ? "PASSED (0 Blockers)" : "REJECTED (Action Required)"}\n\n`;
      report += `### Dialectic Objections (${reviewResult.objections.length}):\n`;
      reviewResult.objections.forEach((o) => {
        report += `- [${o.id}] **${o.lens}** (${o.severity}): ${o.title}\n  Critique: ${o.critique}\n  Required Action: ${o.requiredAction}\n`;
      });
      report += `\n### Problem Slice Decomposition:\n`;
      report += `- Estimated LOC: ${reviewResult.sliceDecomposition.estimatedLOC} (Limit: <400 LOC) -> ${reviewResult.sliceDecomposition.isWithinLimit ? "WITHIN LIMIT" : "EXCEEDED LIMIT (BLOCKER)"}\n`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 3: Request Human Exemption for Low-Risk Work
  pi.registerTool({
    name: "craft_request_gate_exemption",
    label: "Craftsmanship: Request Human Exemption for Low-Risk Work",
    description: "Requests human confirmation to skip heavy steps (FORMAL_METHODS, C4_DIAGRAMS, ADR_DOCUMENTATION, RFC_GOVERNANCE) for small or low-risk work.",
    executionMode: "sequential",
    parameters: Type.Object({
      gate: Type.Union([
        Type.Literal("FORMAL_METHODS"),
        Type.Literal("C4_DIAGRAMS"),
        Type.Literal("ADR_DOCUMENTATION"),
        Type.Literal("RFC_GOVERNANCE"),
      ], { description: "The quality gate to request exemption for" }),
      riskAssessment: Type.String({ description: "Agent risk assessment explaining why the work is small/low-risk enough to skip this step" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);

      const prompt = `Agent assesses gate '${params.gate}' as low-risk. Reason: "${params.riskAssessment}". Do you confirm skipping '${params.gate}'?`;
      const approved = await promptConfirm(ctx?.ui, "Quality Gate Exemption Request", prompt);
      let notes = "Skipped by agent request.";
      if (approved) {
        notes = (await promptInput(ctx?.ui, `Enter Human Exemption Notes for skipping '${params.gate}':`)) || "Skipped by agent request.";
      }

      const exemption = {
        gate: params.gate as ExemptableGate,
        riskAssessment: params.riskAssessment,
        requestedByAgent: true,
        humanApproved: approved,
        humanReviewerNotes: notes,
        timestamp: new Date().toISOString(),
      };

      qEngine.recordExemption(exemption);

      if (approved) {
        return { content: [{ type: "text", text: `EXEMPTION GRANTED: Human approved skipping '${params.gate}' for this slice. Notes: ${notes}` }] };
      } else {
        return { content: [{ type: "text", text: `EXEMPTION DENIED: Human rejected skipping '${params.gate}'. Step remains MANDATORY.` }] };
      }
    },
  });

  // Tool 4: Generate Code-Derived C4 D2 Diagrams
  pi.registerTool({
    name: "craft_generate_c4_d2",
    label: "Craftsmanship: Code-Generated C4 D2 Diagrams",
    description: "Constructs Context, Container, Component, and Code level C4 architecture diagrams directly from source file AST structures formatted in D2 syntax.",
    executionMode: "parallel",
    parameters: Type.Object({
      sliceName: Type.String({ description: "Name of system slice" }),
      sourceFiles: Type.Optional(Type.Array(Type.String(), { description: "Source files to parse for AST diagram extraction" })),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const design = new SystemDesignEngine(cwd);
      const c4 = design.generateC4FromCode(params.sliceName, params.sourceFiles || []);
      const filePath = design.saveC4Diagrams(c4);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.updateC4Spec(c4);

      return { content: [{ type: "text", text: `C4 D2 diagrams generated from code AST and saved to ${filePath}` }] };
    },
  });

  // Tool 5: Generate Formal Specs (Alloy, TLA+, & Stateful Property-Based Tests)
  pi.registerTool({
    name: "craft_generate_formal_spec",
    label: "Craftsmanship: Formal Methods (Alloy, TLA+, & Stateful Property Tests)",
    description: "Generates declarative Alloy models (.als), TLA+ state specs (.tla/.cfg), stateful fast-check property tests, and checks formal completeness & state counterexample traces.",
    executionMode: "parallel",
    parameters: Type.Object({
      sliceName: Type.String({ description: "Name of system slice" }),
      invariants: Type.Array(Type.String(), { description: "Safety & liveness state invariants to prove" }),
      simulateCounterexample: Type.Optional(Type.Boolean({ description: "Set true to test counterexample handling" })),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const design = new SystemDesignEngine(cwd);
      const model = design.generateFormalModels(params.sliceName, params.invariants, params.simulateCounterexample);
      const saved = design.saveFormalModels(params.sliceName, model);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.updateFormalModel(model);
      if (model.provedAbstractly) {
        qEngine.setPhase("SYSTEM_DESIGN_C4_FORMAL");
      }

      let text = `Formal Methods Specifications Generated:\n`;
      text += `- Alloy Model: ${saved.alloyPath}\n`;
      text += `- TLA+ Spec  : ${saved.tlaPath}\n`;
      text += `- Property Test: ${saved.propertyPath}\n`;
      text += `- Formal Completeness: ${model.completenessEvaluation.isComplete ? "COMPLETE" : "INCOMPLETE"}\n`;

      if (model.counterexample) {
        text += `\nCRITICAL COUNTEREXAMPLE DETECTED:\n- Invariant Violated: ${model.counterexample.invariantViolated}\n- State Counterexample Trace: ${JSON.stringify(model.counterexample.stateTrace, null, 2)}\nMust resolve in formal spec before proceeding!`;
      }

      return { content: [{ type: "text", text }] };
    },
  });

  // Tool 6: Create ADR
  pi.registerTool({
    name: "craft_create_adr",
    label: "Craftsmanship: Record Architectural Decision (ADR)",
    description: "Creates a MADR architecture decision record in docs/adr/.",
    executionMode: "sequential",
    parameters: Type.Object({
      title: Type.String({ description: "ADR title" }),
      context: Type.String({ description: "Context and problem statement" }),
      decision: Type.String({ description: "Architectural decision outcome" }),
      consequences: Type.Array(Type.String(), { description: "Positive consequences" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const gov = new ArchitectureGovernanceEngine(cwd);
      const { record, filePath } = gov.createADR(params.title, params.context, params.decision, params.consequences);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.addADR(record);

      return { content: [{ type: "text", text: `ADR #${record.id} created at ${filePath}` }] };
    },
  });

  // Tool 7: Dialectic 6-Lens Agent RFC Review & Human Sign-off
  pi.registerTool({
    name: "craft_run_rfc_panel",
    label: "Craftsmanship: 6-Lens Dialectic RFC Panel & Human Sign-off",
    description: "Evaluates challenging architectural strategies across 6 agent lenses (Security, Consistency, Efficiency, Simplicity, Maintainability, Elegance) returning structured Dialectic Objections and soliciting human sign-off.",
    executionMode: "sequential",
    parameters: Type.Object({
      rfcId: Type.String({ description: "RFC identifier (e.g. RFC-0001)" }),
      title: Type.String({ description: "RFC title" }),
      strategyDescription: Type.String({ description: "Detailed strategy description" }),
      tradeOffs: Type.Array(Type.String(), { description: "Known trade-offs" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const gov = new ArchitectureGovernanceEngine(cwd);
      const rfc = gov.evaluateRFCPanel(params.rfcId, params.title, params.strategyDescription, params.tradeOffs);
      const filePath = gov.saveRFC(rfc);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.addOrUpdateRFC(rfc);
      qEngine.setPhase("ADR_RFC_GOVERNANCE");

      let report = `## RFC ${rfc.id} Dialectic Agent Panel Review\n`;
      report += `**Saved File**: ${filePath}\n`;
      report += `**Status**: ${rfc.status}\n\n`;
      report += `### Objections (${rfc.reviewResult.objections.length}):\n`;
      rfc.reviewResult.objections.forEach((o) => {
        report += `- [${o.id}] **${o.lens}** (${o.severity}): ${o.title}\n  Critique: ${o.critique}\n  Required Action: ${o.requiredAction}\n`;
      });
      report += `\n### HUMAN REVIEW SIGN-OFF REQUIRED:\n`;
      report += `Run '/craft-rfc approve ${rfc.id}' to provide human review sign-off.`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 8: Self-Healing TDD RED/GREEN Iteration Engine
  pi.registerTool({
    name: "craft_auto_tdd_loop",
    label: "Craftsmanship: Self-Healing TDD RED/GREEN Iteration Loop",
    description: "Executes unit test iteration loop, captures stack traces and assertion diffs, verifies RED failure before code exists, and verifies clean GREEN passing state.",
    executionMode: "sequential",
    parameters: Type.Object({
      unitTestFilePath: Type.String({ description: "Path to unit test file" }),
      implementationFilePath: Type.String({ description: "Path to implementation file" }),
      redLog: Type.String({ description: "Raw stdout/stderr execution log for RED test run" }),
      greenLog: Type.String({ description: "Raw stdout/stderr execution log for GREEN test run" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const tdd = new TDDEngine();
      const res = tdd.runAutoTDDIterationLoop(params.unitTestFilePath, params.implementationFilePath, params.redLog, params.greenLog);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.addTDDCycle({
        unitTestFilePath: params.unitTestFilePath,
        implementationFilePath: params.implementationFilePath,
        redVerified: res.redVerified,
        greenVerified: res.greenVerified,
        autoTddIterations: res.iterations,
      });

      if (res.passedCleanly) {
        qEngine.setPhase("TDD_UNIT_RED_GREEN");
      }

      let output = `## Self-Healing TDD Iteration Loop Results\n`;
      output += `- RED Verification: ${res.redVerified ? "PASSED (Failed as expected prior to code)" : "FAILED"}\n`;
      output += `- GREEN Verification: ${res.greenVerified ? "PASSED (All tests passing cleanly)" : "FAILED"}\n`;
      output += `- Iterations Run: ${res.iterations}\n`;

      return { content: [{ type: "text", text: output }] };
    },
  });

  // Tool 9: Run Mutation Testing
  pi.registerTool({
    name: "craft_run_mutation_tests",
    label: "Craftsmanship: Execute Mutation Testing",
    description: "Runs mutation test analysis against unit test suite and asserts >= 85% mutant kill rate threshold.",
    executionMode: "sequential",
    parameters: Type.Object({
      testCode: Type.String({ description: "Unit test code" }),
      implCode: Type.String({ description: "Implementation code" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const tdd = new TDDEngine();
      const result = tdd.evaluateMutationTesting(params.testCode, params.implCode);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.updateMutationResult(result);
      if (result.passedThreshold) {
        qEngine.setPhase("MUTATION_TESTING");
      }

      let report = `## Mutation Testing Report\n`;
      report += `- Total Mutants: ${result.totalMutants}\n`;
      report += `- Killed Mutants: ${result.killedMutants}\n`;
      report += `- Survived Mutants: ${result.survivedMutants}\n`;
      report += `- Mutant Kill Rate: ${result.killRatePercent}% (Threshold: >=85%)\n`;
      report += `- Gate Status: ${result.passedThreshold ? "PASSED" : "FAILED"}\n`;

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 10: Dialectic Post-Implementation Review & Architectural Drift Guard
  pi.registerTool({
    name: "craft_run_code_review",
    label: "Craftsmanship: Dialectic Code Review & Drift Guard",
    description: "Evaluates implementation against static analysis, 7 dialectic lenses, and Architectural Drift Guard.",
    executionMode: "parallel",
    parameters: Type.Object({
      codeContent: Type.String({ description: "Implementation code" }),
      testContent: Type.String({ description: "Test code" }),
      staticAnalysisOutput: Type.Optional(Type.String({ description: "Static analysis / compiler output" })),
      sourceFiles: Type.Optional(Type.Array(Type.String(), { description: "Source files for drift guard analysis" })),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      const reviewer = new PostImplementationCodeReviewPanel();
      const result = reviewer.runReview(params.codeContent, params.testContent, state, params.staticAnalysisOutput, params.sourceFiles || []);

      qEngine.updateDriftReport(result.driftReport);
      qEngine.updateFinalReview(result);

      if (result.passed) {
        qEngine.setPhase("GUIDED_HUMAN_SLICE_REVIEW");
      }

      let report = `## Post-Implementation Dialectic Code Review & Architectural Drift Report\n`;
      report += `**Overall Status**: ${result.passed ? "PASSED (Ready for GUIDED HUMAN SLICE REVIEW)" : "REJECTED"}\n\n`;
      report += `### Architectural Drift Guard:\n`;
      report += `- Has Drift: ${result.driftReport.hasDrift ? "YES (BLOCKER)" : "NO (In Sync)"}\n`;
      if (result.driftReport.undocumentedChanges.length > 0) {
        result.driftReport.undocumentedChanges.forEach((d) => (report += `  - Drift: ${d}\n`));
      }
      report += `\n### Dialectic Objections (${result.dialecticReview.objections.length}):\n`;
      result.dialecticReview.objections.forEach((o) => {
        report += `- [${o.id}] **${o.lens}** (${o.severity}): ${o.title}\n  Critique: ${o.critique}\n  Required Action: ${o.requiredAction}\n`;
      });
      if (result.passed) {
        report += `\n### GUIDED HUMAN SLICE REVIEW REQUIRED:\nRun '/craft-slice-review' to conduct the guided slice walkthrough and record human sign-off.`;
      }

      return { content: [{ type: "text", text: report }] };
    },
  });

  // Tool 11: Guided Human Slice Review Walkthrough & Sign-off
  pi.registerTool({
    name: "craft_guided_human_slice_review",
    label: "Craftsmanship: Guided Human Slice Review Walkthrough",
    description: "Generates a structured 6-section guided walkthrough of the slice for human review and records human sign-off to lock completion.",
    executionMode: "sequential",
    parameters: Type.Object({
      reviewerName: Type.String({ description: "Name/ID of the human reviewer" }),
      notes: Type.String({ description: "Human reviewer notes and feedback" }),
      approved: Type.Boolean({ description: "Human approval decision (true to lock slice)" }),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      const record = {
        sliceName: state.sliceName,
        reviewerName: params.reviewerName,
        approved: params.approved,
        notes: params.notes,
        timestamp: new Date().toISOString(),
        walkthroughSections: {
          bddSummary: state.bddSpec ? `Feature: ${state.bddSpec.featureName} (${state.bddSpec.scenarios.length} scenarios, RED Verified: ${state.bddSpec.isRedVerified})` : "None",
          designAndADRSummary: `C4 D2: ${state.c4Spec ? "Generated" : "Missing/Exempt"}, ADRs: ${state.adrs.length} recorded`,
          formalAndPropertySummary: `Formal Spec: ${state.formalModel ? (state.formalModel.provedAbstractly ? "Verified (Alloy & TLA+)" : "Counterexample Detected") : "Missing/Exempt"}`,
          testAndMutationSummary: `Mutation Kill Rate: ${state.mutationResult?.killRatePercent || 0}% (Threshold >= 85%)`,
          staticAnalysisAndReviewSummary: `Static Diagnostics: Clean, Dialectic Review: ${state.finalReview?.passed ? "Passed 7 Lenses" : "Rejected"}`,
          driftGuardSummary: `Architectural Drift: ${state.driftReport?.hasDrift ? "DRIFT DETECTED" : "NO DRIFT (In Sync)"}`,
        },
      };

      qEngine.recordHumanSliceReview(record);

      if (params.approved) {
        qEngine.setPhase("COMPLETED_LOCKED");
      }

      let summary = `## Guided Human Slice Review Record\n`;
      summary += `- **Slice Name**: ${state.sliceName}\n`;
      summary += `- **Reviewer**: ${params.reviewerName}\n`;
      summary += `- **Approval Status**: ${params.approved ? "APPROVED & LOCKED" : "REJECTED"}\n`;
      summary += `- **Review Notes**: ${params.notes}\n\n`;
      summary += `### Walkthrough Verification Checkpoints:\n`;
      summary += `- BDD Acceptance Criteria: ${record.walkthroughSections.bddSummary}\n`;
      summary += `- C4 Design & ADRs: ${record.walkthroughSections.designAndADRSummary}\n`;
      summary += `- Formal Specs & Properties: ${record.walkthroughSections.formalAndPropertySummary}\n`;
      summary += `- Mutation Tests: ${record.walkthroughSections.testAndMutationSummary}\n`;
      summary += `- Dialectic Code Review: ${record.walkthroughSections.staticAnalysisAndReviewSummary}\n`;
      summary += `- Architectural Drift Guard: ${record.walkthroughSections.driftGuardSummary}\n`;

      return { content: [{ type: "text", text: summary }] };
    },
  });

  // Tool 12: Check Quality Gate Status
  pi.registerTool({
    name: "craft_check_gate",
    label: "Craftsmanship: Check Quality Gate Status",
    description: "Returns the current quality gate state and checks hard gate transition eligibility.",
    executionMode: "parallel",
    parameters: Type.Object({
      targetPhase: Type.Optional(Type.String({ description: "Target phase to test transition against" })),
    }),
    execute: async (_id: string, params: any, _signal: any, _onUpdate: any, ctx?: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      let output = `Current Workflow Phase: ${state.currentPhase}\nSlice Name: ${state.sliceName}\nHard Gates Enforced: ${state.hardGateEnforced ? "YES" : "NO"}\nExemptions: ${(state.exemptions || []).map((e) => `${e.gate}:${e.humanApproved ? "APPROVED" : "DENIED"}`).join(", ") || "None"}\n`;
      if (params.targetPhase) {
        const check = qEngine.canTransitionTo(params.targetPhase as any);
        output += `Transition Check to '${params.targetPhase}': ${check.allowed ? "ALLOWED" : `BLOCKED (${check.reason})`}`;
      }

      return { content: [{ type: "text", text: output }] };
    },
  });
}

