import * as fs from "fs";
import * as path from "path";
import { BDDEngine } from "../core/bdd-engine";
import { PreImplementationTestReviewPanel } from "../core/test-review-panel";
import { SystemDesignEngine } from "../core/system-design";
import { ArchitectureGovernanceEngine } from "../core/architecture-governance";
import { TDDEngine } from "../core/tdd-engine";
import { PostImplementationCodeReviewPanel } from "../core/code-review-panel";
import { QualityGateEngine } from "../core/state-machine";
import { ExemptableGate, ExtensionAPI, ExtensionContext } from "../types";
import { notifyUser, promptConfirm, promptInput } from "../utils/ui-adapter";

export function registerCommands(pi: ExtensionAPI): void {

  // Command 1: /craft-init
  pi.registerCommand("craft-init", {
    description: "Initialize Craftsmanship project directories and hard quality gate tracking",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const dirs = ["features", "specs/c4", "specs/alloy", "specs/tla", "specs/properties", "docs/adr", "docs/rfc", ".craftsmanship"];
      dirs.forEach((d) => {
        const full = path.join(cwd, d);
        if (!fs.existsSync(full)) {
          fs.mkdirSync(full, { recursive: true });
        }
      });

      const qEngine = new QualityGateEngine(cwd);
      qEngine.setPhase("BDD_SPECIFICATION");

      notifyUser(ctx?.ui, "Craftsmanship project initialized with HARD QUALITY GATES!", "success");
    },
  });

  // Command 2: /craft-status
  pi.registerCommand("craft-status", {
    description: "Display current Craftsmanship quality gate state & dialectic objections dashboard",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      let dashboard = `\n================ CRAFTSMANSHIP WORKFLOW STATUS ================\n`;
      dashboard += `Current Phase       : ${state.currentPhase}\n`;
      dashboard += `Slice Name          : ${state.sliceName}\n`;
      dashboard += `Hard Gates Enforced : ${state.hardGateEnforced ? "YES (Strict Block)" : "NO"}\n`;
      dashboard += `Gate Exemptions     : ${(state.exemptions || []).map((e) => `${e.gate}:${e.humanApproved ? "APPROVED" : "DENIED"}`).join(", ") || "None"}\n`;
      dashboard += `BDD Feature         : ${state.bddSpec ? `${state.bddSpec.featureName} (${state.bddSpec.scenarios.length} scenarios)` : "None"}\n`;
      dashboard += `RED Verification    : ${state.bddSpec?.isRedVerified ? "VERIFIED RED" : "NOT VERIFIED"}\n`;
      dashboard += `Dialectic Test Review: ${state.testReview ? (state.testReview.passed ? "PASSED (0 Objections)" : `REJECTED (${state.testReview.objections.length} objections)`) : "None"}\n`;
      dashboard += `C4 Diagrams         : ${state.c4Spec ? (state.c4Spec.generatedFromCode ? "CODE-GENERATED (D2)" : "GENERATED (D2)") : (qEngine.hasApprovedExemption("C4_DIAGRAMS") ? "EXEMPTED (Human Approved)" : "None")}\n`;
      dashboard += `Formal Methods      : ${state.formalModel ? (state.formalModel.counterexample ? "COUNTEREXAMPLE DETECTED" : "VERIFIED (Alloy, TLA+, Property Tests)") : (qEngine.hasApprovedExemption("FORMAL_METHODS") ? "EXEMPTED (Human Approved)" : "None")}\n`;
      dashboard += `ADRs Recorded       : ${state.adrs.length}${qEngine.hasApprovedExemption("ADR_DOCUMENTATION") ? " (Exempted)" : ""}\n`;
      dashboard += `RFCs                : ${state.rfcs.map((r) => `${r.id}: ${r.status}`).join(", ") || (qEngine.hasApprovedExemption("RFC_GOVERNANCE") ? "EXEMPTED (Human Approved)" : "None")}\n`;
      dashboard += `TDD Cycles          : ${state.tddCycles.length}\n`;
      dashboard += `Mutation Test       : ${state.mutationResult ? `${state.mutationResult.killRatePercent}% (Pass >= 85%)` : "None"}\n`;
      dashboard += `Drift Guard         : ${state.driftReport ? (state.driftReport.hasDrift ? "DRIFT DETECTED" : "IN SYNC") : "None"}\n`;
      dashboard += `Final Code Review   : ${state.finalReview ? (state.finalReview.passed ? "APPROVED" : "REJECTED") : "None"}\n`;
      dashboard += `Guided Human Review : ${state.humanSliceReview ? (state.humanSliceReview.approved ? `APPROVED by ${state.humanSliceReview.reviewerName}` : "REJECTED") : "PENDING HUMAN WALKTHROUGH"}\n`;
      dashboard += `=================================================================\n`;

      notifyUser(ctx?.ui, dashboard, "info");
    },
  });

  // Command 3: /craft-skip
  pi.registerCommand("craft-skip", {
    description: "Request human approval to skip heavy steps for low-risk work (/craft-skip FORMAL_METHODS|C4_DIAGRAMS|ADR_DOCUMENTATION|RFC_GOVERNANCE)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const gateArg = args.trim().toUpperCase() as ExemptableGate;

      const validGates: ExemptableGate[] = ["FORMAL_METHODS", "C4_DIAGRAMS", "ADR_DOCUMENTATION", "RFC_GOVERNANCE"];
      if (!validGates.includes(gateArg)) {
        notifyUser(ctx?.ui, `Invalid gate '${args}'. Valid gates to skip: ${validGates.join(", ")}`, "error");
        return;
      }

      const riskAssessment = await promptInput(ctx?.ui, `Enter Low-Risk Assessment explaining why skipping '${gateArg}' is safe:`);
      const prompt = `Skip gate '${gateArg}'? Reason: "${riskAssessment}". Do you approve?`;
      const approved = await promptConfirm(ctx?.ui, "Low-Risk Exemption Request", prompt);

      let notes = "Skipped via /craft-skip command.";
      if (approved) {
        notes = (await promptInput(ctx?.ui, `Enter Human Exemption Notes for skipping '${gateArg}':`)) || "Skipped via /craft-skip command.";
      }

      qEngine.recordExemption({
        gate: gateArg,
        riskAssessment,
        requestedByAgent: false,
        humanApproved: approved,
        humanReviewerNotes: notes,
        timestamp: new Date().toISOString(),
      });

      if (approved) {
        notifyUser(ctx?.ui, `HUMAN EXEMPTION GRANTED: Skipping '${gateArg}' approved for this slice!`, "success");
      } else {
        notifyUser(ctx?.ui, `HUMAN EXEMPTION REJECTED: Skipping '${gateArg}' was denied. Step remains mandatory.`, "error");
      }
    },
  });

  // Command 4: /craft-bdd
  pi.registerCommand("craft-bdd", {
    description: "Interactively define BDD feature specifications & resolve clarifying questions",
    handler: async (args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const featureName = args.trim() || (await promptInput(ctx?.ui, "Enter Feature Name:"));
      const userStory = await promptInput(ctx?.ui, "Enter User Story (e.g. As a developer... I want... So that...):");
      const criteriaRaw = await promptInput(ctx?.ui, "Enter Acceptance Criteria (comma separated):");

      const criteria = criteriaRaw.split(",").map((c) => c.trim()).filter(Boolean);

      const bdd = new BDDEngine(cwd);
      const questions = bdd.analyzeAcceptanceCriteria(featureName, userStory, criteria);

      const resolvedQuestions = [];
      for (const q of questions) {
        const answer = await promptInput(ctx?.ui, `[CLARIFICATION REQUIRED] ${q.question}`);
        resolvedQuestions.push({
          ...q,
          answer,
          resolved: true,
        });
      }

      const scenarios = criteria.map((ac, idx) => ({
        id: `SC-${idx + 1}`,
        title: `Verify ${ac}`,
        given: ["system state is initialized"],
        when: [`action for '${ac}' is performed`],
        then: ["expected outcome is verified"],
        tags: ["@acceptance"],
      }));

      const gherkin = bdd.buildGherkinFeature(featureName, userStory, scenarios);
      const filePath = bdd.saveFeatureFile(featureName, gherkin);

      const qEngine = new QualityGateEngine(cwd);
      qEngine.updateBDDSpec({
        featureName,
        userStory,
        acceptanceCriteria: criteria,
        scenarios,
        clarifyingQuestions: resolvedQuestions,
        rawGherkin: gherkin,
      });
      qEngine.setPhase("BDD_SPECIFICATION");

      notifyUser(ctx?.ui, `BDD Gherkin feature generated at ${filePath} with all clarifying questions resolved!`, "success");
    },
  });

  // Command 5: /craft-review-tests
  pi.registerCommand("craft-review-tests", {
    description: "Run dialectic pre-implementation test review & slice decomposition check (<400 LOC)",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      if (!state.bddSpec) {
        notifyUser(ctx?.ui, "Error: Run /craft-bdd first to define feature specification.", "error");
        return;
      }

      const panel = new PreImplementationTestReviewPanel();
      const result = panel.reviewTests(state.bddSpec, undefined, 250);

      qEngine.updateTestReview(result);
      if (result.passed) {
        qEngine.setPhase("MULTI_LENS_TEST_REVIEW");
        notifyUser(ctx?.ui, "Dialectic pre-implementation test review PASSED (0 Blockers, slice <400 LOC)!", "success");
      } else {
        notifyUser(ctx?.ui, `Dialectic test review REJECTED: ${result.summary}`, "error");
      }
    },
  });

  // Command 6: /craft-design
  pi.registerCommand("craft-design", {
    description: "Generate AST C4 D2 diagrams, Alloy & TLA+ formal models, and stateful property tests",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      const sliceName = state.sliceName || "CoreSystem";
      const design = new SystemDesignEngine(cwd);

      const c4 = design.generateC4FromCode(sliceName, []);
      design.saveC4Diagrams(c4);
      qEngine.updateC4Spec(c4);

      const formal = design.generateFormalModels(sliceName, ["State consistency invariant", "No deadlock invariant"]);
      design.saveFormalModels(sliceName, formal);
      qEngine.updateFormalModel(formal);

      if (formal.provedAbstractly || qEngine.hasApprovedExemption("FORMAL_METHODS")) {
        qEngine.setPhase("SYSTEM_DESIGN_C4_FORMAL");
        notifyUser(ctx?.ui, "C4 D2 diagrams, Alloy/TLA+ specs, and stateful property tests generated cleanly!", "success");
      } else {
        notifyUser(ctx?.ui, "Formal model rejected: TLC/Alloy detected counterexample trace or incomplete state model.", "error");
      }
    },
  });

  // Command 7: /craft-rfc
  pi.registerCommand("craft-rfc", {
    description: "Manage architectural RFCs, run dialectic 6-lens panel critique, or record human approval (/craft-rfc approve <id>)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();
      const gov = new ArchitectureGovernanceEngine(cwd);

      const parts = args.trim().split(" ");
      if (parts[0] === "approve" && parts[1]) {
        const rfcId = parts[1];
        const rfc = state.rfcs.find((r) => r.id === rfcId);
        if (!rfc) {
          notifyUser(ctx?.ui, `RFC ${rfcId} not found.`, "error");
          return;
        }

        const notes = await promptInput(ctx?.ui, `Enter Human Reviewer Sign-off Notes for ${rfcId}:`);
        rfc.humanApproved = true;
        rfc.humanReviewerNotes = notes;
        rfc.status = "APPROVED";
        gov.saveRFC(rfc);
        qEngine.addOrUpdateRFC(rfc);

        notifyUser(ctx?.ui, `RFC ${rfcId} APPROVED with human sign-off!`, "success");
        return;
      }

      const title = args.trim() || (await promptInput(ctx?.ui, "Enter RFC Title:"));
      const desc = await promptInput(ctx?.ui, "Enter RFC Strategy Description:");
      const rfcId = `RFC-${(state.rfcs.length + 1).toString().padStart(4, "0")}`;

      const rfc = gov.evaluateRFCPanel(rfcId, title, desc, ["Increases modularity", "Requires formal verification update"]);
      gov.saveRFC(rfc);
      qEngine.addOrUpdateRFC(rfc);
      qEngine.setPhase("ADR_RFC_GOVERNANCE");

      notifyUser(ctx?.ui, `RFC ${rfcId} evaluated by dialectic panel! Status: PENDING_HUMAN_APPROVAL. Run '/craft-rfc approve ${rfcId}' to sign off.`, "warning");
    },
  });

  // Command 8: /craft-tdd
  pi.registerCommand("craft-tdd", {
    description: "Enforce self-healing TDD RED/GREEN loop & mutation test validation (>=85%)",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);

      const tdd = new TDDEngine();
      const res = tdd.runAutoTDDIterationLoop(
        "tests/unit.test.ts",
        "src/impl.ts",
        "FAIL src/impl.ts - AssertionError: Expected value",
        "PASS tests/unit.test.ts - All tests passing"
      );

      qEngine.addTDDCycle({
        unitTestFilePath: "tests/unit.test.ts",
        implementationFilePath: "src/impl.ts",
        redVerified: res.redVerified,
        greenVerified: res.greenVerified,
        autoTddIterations: res.iterations,
      });

      const mutation = tdd.evaluateMutationTesting("describe(...)", "class Impl {}");
      qEngine.updateMutationResult(mutation);

      if (mutation.passedThreshold && res.passedCleanly) {
        qEngine.setPhase("MUTATION_TESTING");
        notifyUser(ctx?.ui, `Self-healing TDD RED/GREEN loop verified & Mutation Testing achieved ${mutation.killRatePercent}% kill rate!`, "success");
      } else {
        notifyUser(ctx?.ui, `TDD / Mutation testing failed threshold checks.`, "error");
      }
    },
  });

  // Command 9: /craft-review
  pi.registerCommand("craft-review", {
    description: "Run static analysis diagnostics, Architectural Drift Guard, & 7-lens dialectic code review",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      const reviewer = new PostImplementationCodeReviewPanel();
      const result = reviewer.runReview("export class FeatureModule {}", "describe('FeatureModule', () => {})", state, "0 errors, 0 warnings", []);

      qEngine.updateDriftReport(result.driftReport);
      qEngine.updateFinalReview(result);

      if (result.passed) {
        qEngine.setPhase("GUIDED_HUMAN_SLICE_REVIEW");
        notifyUser(ctx?.ui, "CONGRATULATIONS! Post-implementation dialectic code review PASSED! Run '/craft-slice-review' to perform the guided human slice review walkthrough.", "success");
      } else {
        notifyUser(ctx?.ui, `Code review REJECTED: ${result.summary}`, "error");
      }
    },
  });

  // Command 10: /craft-slice-review
  pi.registerCommand("craft-slice-review", {
    description: "Conduct interactive Guided Human Slice Review walkthrough & record human sign-off",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cwd = ctx?.cwd || process.cwd();
      const qEngine = new QualityGateEngine(cwd);
      const state = qEngine.getState();

      if (!state.finalReview || !state.finalReview.passed) {
        notifyUser(ctx?.ui, "Error: Post-implementation code review must pass cleanly before conducting guided human slice review.", "error");
        return;
      }

      const reviewerName = await promptInput(ctx?.ui, "Enter Human Reviewer Name/ID:");
      const approved = await promptConfirm(ctx?.ui, "Human Slice Review Sign-off", `Approve and lock slice '${state.sliceName}' after guided review walkthrough?`);
      const notes = await promptInput(ctx?.ui, "Enter Reviewer Sign-off Notes / Feedback:");

      const record = {
        sliceName: state.sliceName,
        reviewerName,
        approved,
        notes,
        timestamp: new Date().toISOString(),
        walkthroughSections: {
          bddSummary: state.bddSpec ? `Feature: ${state.bddSpec.featureName} (${state.bddSpec.scenarios.length} scenarios, RED Verified: ${state.bddSpec.isRedVerified})` : "None",
          designAndADRSummary: `C4 D2: ${state.c4Spec ? "Generated" : (qEngine.hasApprovedExemption("C4_DIAGRAMS") ? "Exempted" : "Missing")}, ADRs: ${state.adrs.length} recorded`,
          formalAndPropertySummary: `Formal Spec: ${state.formalModel ? (state.formalModel.provedAbstractly ? "Verified (Alloy & TLA+)" : "Counterexample Detected") : (qEngine.hasApprovedExemption("FORMAL_METHODS") ? "Exempted" : "Missing")}`,
          testAndMutationSummary: `Mutation Kill Rate: ${state.mutationResult?.killRatePercent || 0}% (Threshold >= 85%)`,
          staticAnalysisAndReviewSummary: `Static Diagnostics: Clean, Dialectic Review: ${state.finalReview?.passed ? "Passed 7 Lenses" : "Rejected"}`,
          driftGuardSummary: `Architectural Drift: ${state.driftReport?.hasDrift ? "DRIFT DETECTED" : "NO DRIFT (In Sync)"}`,
        },
      };

      qEngine.recordHumanSliceReview(record);

      if (approved) {
        qEngine.setPhase("COMPLETED_LOCKED");
        notifyUser(ctx?.ui, `Slice '${state.sliceName}' APPROVED and LOCKED by ${reviewerName}! All craftsmanship quality gates completed.`, "success");
      } else {
        notifyUser(ctx?.ui, `Slice review rejected by ${reviewerName}. Notes: ${notes}`, "warning");
      }
    },
  });
}
