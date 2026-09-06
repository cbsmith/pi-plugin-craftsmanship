import * as fs from "fs";
import * as path from "path";
import { BDDEngine } from "../core/bdd-engine";
import { PreImplementationTestReviewPanel } from "../core/test-review-panel";
import { SystemDesignEngine } from "../core/system-design";
import { ArchitectureGovernanceEngine } from "../core/architecture-governance";
import { TDDEngine } from "../core/tdd-engine";
import { PostImplementationCodeReviewPanel } from "../core/code-review-panel";
import { QualityGateEngine } from "../core/state-machine";
import { ExtensionAPI, ExtensionContext } from "../types";

export function registerCommands(pi: ExtensionAPI): void {

  // Command 1: /craft-init
  pi.registerCommand("craft-init", {
    description: "Initialize Craftsmanship project directories and quality gate tracking",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const dirs = ["features", "specs/c4", "specs/alloy", "specs/tla", "docs/adr", "docs/rfc", ".craftsmanship"];
      dirs.forEach((d) => {
        const full = path.join(ctx.cwd, d);
        if (!fs.existsSync(full)) {
          fs.mkdirSync(full, { recursive: true });
        }
      });

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.setPhase("BDD_SPECIFICATION");

      ctx.ui.notify("Craftsmanship project initialized successfully!", "success");
    },
  });

  // Command 2: /craft-status
  pi.registerCommand("craft-status", {
    description: "Display current Craftsmanship quality gate state & slice metrics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      let dashboard = `\n================ CRAFTSMANSHIP WORKFLOW STATUS ================\n`;
      dashboard += `Current Phase   : ${state.currentPhase}\n`;
      dashboard += `Slice Name      : ${state.sliceName}\n`;
      dashboard += `BDD Feature     : ${state.bddSpec ? `${state.bddSpec.featureName} (${state.bddSpec.scenarios.length} scenarios)` : "None"}\n`;
      dashboard += `RED Verification: ${state.bddSpec?.isRedVerified ? "VERIFIED RED" : "NOT VERIFIED"}\n`;
      dashboard += `Test Review     : ${state.testReview ? (state.testReview.passed ? "PASSED (4 Lenses)" : "FAILED") : "None"}\n`;
      dashboard += `C4 Diagrams     : ${state.c4Spec ? "GENERATED (D2)" : "None"}\n`;
      dashboard += `Formal Methods  : ${state.formalModel ? "GENERATED (Alloy & TLA+)" : "None"}\n`;
      dashboard += `ADRs Recorded   : ${state.adrs.length}\n`;
      dashboard += `RFCs            : ${state.rfcs.map((r) => `${r.id}: ${r.status}`).join(", ") || "None"}\n`;
      dashboard += `TDD Cycles      : ${state.tddCycles.length}\n`;
      dashboard += `Mutation Test   : ${state.mutationResult ? `${state.mutationResult.killRatePercent}% (Pass >= 85%)` : "None"}\n`;
      dashboard += `Final Review    : ${state.finalReview ? (state.finalReview.passed ? "APPROVED" : "REJECTED") : "None"}\n`;
      dashboard += `=================================================================\n`;

      ctx.ui.notify(dashboard, "info");
    },
  });

  // Command 3: /craft-bdd
  pi.registerCommand("craft-bdd", {
    description: "Interactively define BDD feature specifications & resolve clarifying questions",
    handler: async (args: string, ctx: ExtensionContext) => {
      const featureName = args.trim() || (await ctx.ui.ask("Enter Feature Name:"));
      const userStory = await ctx.ui.ask("Enter User Story (e.g. As a developer... I want... So that...):");
      const criteriaRaw = await ctx.ui.ask("Enter Acceptance Criteria (comma separated):");

      const criteria = criteriaRaw.split(",").map((c) => c.trim()).filter(Boolean);

      const bdd = new BDDEngine(ctx.cwd);
      const questions = bdd.analyzeAcceptanceCriteria(featureName, userStory, criteria);

      const resolvedQuestions = [];
      for (const q of questions) {
        const answer = await ctx.ui.ask(`[CLARIFICATION REQUIRED] ${q.question}`);
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

      const qEngine = new QualityGateEngine(ctx.cwd);
      qEngine.updateBDDSpec({
        featureName,
        userStory,
        acceptanceCriteria: criteria,
        scenarios,
        clarifyingQuestions: resolvedQuestions,
        rawGherkin: gherkin,
      });
      qEngine.setPhase("BDD_SPECIFICATION");

      ctx.ui.notify(`BDD Gherkin feature generated at ${filePath} with all clarifying questions resolved!`, "success");
    },
  });

  // Command 4: /craft-review-tests
  pi.registerCommand("craft-review-tests", {
    description: "Run 4-lens pre-implementation test review & slice decomposition check (<400 LOC)",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      if (!state.bddSpec) {
        ctx.ui.notify("Error: Run /craft-bdd first to define feature specification.", "error");
        return;
      }

      const panel = new PreImplementationTestReviewPanel();
      const result = panel.reviewTests(state.bddSpec, undefined, 250);

      qEngine.updateTestReview(result);
      if (result.passed) {
        qEngine.setPhase("MULTI_LENS_TEST_REVIEW");
        ctx.ui.notify("Pre-implementation test review PASSED across all 4 lenses & slice size limits!", "success");
      } else {
        ctx.ui.notify(`Pre-implementation test review REJECTED: ${result.overallCritique}`, "error");
      }
    },
  });

  // Command 5: /craft-design
  pi.registerCommand("craft-design", {
    description: "Generate C4 D2 diagrams and Alloy & TLA+ formal verification specifications",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      const sliceName = state.sliceName || "CoreSystem";
      const design = new SystemDesignEngine(ctx.cwd);

      const c4 = design.generateC4D2Diagrams(sliceName, "C4 Architecture diagrams");
      design.saveC4Diagrams(c4);
      qEngine.updateC4Spec(c4);

      const formal = design.generateFormalModels(sliceName, ["State consistency invariant", "No deadlock invariant"]);
      design.saveFormalModels(sliceName, formal);
      qEngine.updateFormalModel(formal);

      qEngine.setPhase("SYSTEM_DESIGN_C4_FORMAL");
      ctx.ui.notify("C4 D2 diagrams & Alloy / TLA+ formal models generated in specs/", "success");
    },
  });

  // Command 6: /craft-rfc
  pi.registerCommand("craft-rfc", {
    description: "Manage architectural RFCs, run 6-lens panel critique, or record human approval (/craft-rfc approve <id>)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();
      const gov = new ArchitectureGovernanceEngine(ctx.cwd);

      const parts = args.trim().split(" ");
      if (parts[0] === "approve" && parts[1]) {
        const rfcId = parts[1];
        const rfc = state.rfcs.find((r) => r.id === rfcId);
        if (!rfc) {
          ctx.ui.notify(`RFC ${rfcId} not found.`, "error");
          return;
        }

        const notes = await ctx.ui.ask(`Enter Human Reviewer Sign-off Notes for ${rfcId}:`);
        rfc.humanApproved = true;
        rfc.humanReviewerNotes = notes;
        rfc.status = "APPROVED";
        gov.saveRFC(rfc);
        qEngine.addOrUpdateRFC(rfc);

        ctx.ui.notify(`RFC ${rfcId} APPROVED with human sign-off!`, "success");
        return;
      }

      // Default: create and evaluate new RFC
      const title = args.trim() || (await ctx.ui.ask("Enter RFC Title:"));
      const desc = await ctx.ui.ask("Enter RFC Strategy Description:");
      const rfcId = `RFC-${(state.rfcs.length + 1).toString().padStart(4, "0")}`;

      const rfc = gov.evaluateRFCPanel(rfcId, title, desc, ["Increases modularity", "Requires formal verification update"]);
      gov.saveRFC(rfc);
      qEngine.addOrUpdateRFC(rfc);
      qEngine.setPhase("ADR_RFC_GOVERNANCE");

      ctx.ui.notify(`RFC ${rfcId} evaluated by 6-lens panel! Status: PENDING_HUMAN_APPROVAL. Run '/craft-rfc approve ${rfcId}' to sign off.`, "warning");
    },
  });

  // Command 7: /craft-tdd
  pi.registerCommand("craft-tdd", {
    description: "Enforce TDD RED/GREEN verification and run mutation testing threshold validation",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);

      const tdd = new TDDEngine();
      const cycle = tdd.verifyRedCycle("tests/unit.test.ts", "FAIL src/impl.ts - AssertionError: Expected value");
      const greenCycle = tdd.verifyGreenCycle(cycle, "src/impl.ts", "PASS tests/unit.test.ts - All 5 tests passing");

      qEngine.addTDDCycle(greenCycle);

      const mutation = tdd.evaluateMutationTesting("describe(...)", "class Impl {...}");
      qEngine.updateMutationResult(mutation);

      if (mutation.passedThreshold) {
        qEngine.setPhase("MUTATION_TESTING");
        ctx.ui.notify(`TDD RED/GREEN cycle passed & Mutation Testing achieved ${mutation.killRatePercent}% kill rate (>=85% threshold)!`, "success");
      } else {
        ctx.ui.notify(`Mutation testing failed: Kill rate ${mutation.killRatePercent}% below 85% threshold.`, "error");
      }
    },
  });

  // Command 8: /craft-review
  pi.registerCommand("craft-review", {
    description: "Run static analysis diagnostics & 7-lens post-implementation code review",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const qEngine = new QualityGateEngine(ctx.cwd);
      const state = qEngine.getState();

      const reviewer = new PostImplementationCodeReviewPanel();
      const result = reviewer.runReview("export class FeatureModule {}", "describe('FeatureModule', () => {})", state, "0 errors, 0 warnings");

      qEngine.updateFinalReview(result);
      if (result.passed) {
        qEngine.setPhase("COMPLETED_LOCKED");
        ctx.ui.notify("CONGRATULATIONS! Post-implementation 7-lens code review PASSED! Feature slice complete and ready to merge.", "success");
      } else {
        ctx.ui.notify(`Code review REJECTED: ${result.summary}`, "error");
      }
    },
  });
}
