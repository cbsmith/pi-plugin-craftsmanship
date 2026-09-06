import * as fs from "fs";
import * as path from "path";
import { QualityGateState, WorkflowPhase } from "../types";

export class QualityGateEngine {
  private stateFilePath: string;
  private state: QualityGateState;

  constructor(projectRoot: string) {
    const craftDir = path.join(projectRoot, ".craftsmanship");
    if (!fs.existsSync(craftDir)) {
      fs.mkdirSync(craftDir, { recursive: true });
    }
    this.stateFilePath = path.join(craftDir, "state.json");
    this.state = this.loadState();
  }

  private loadState(): QualityGateState {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, "utf-8");
        return JSON.parse(raw);
      } catch {
        // Return default state on parse error
      }
    }
    return {
      currentPhase: "UNINITIALIZED",
      sliceName: "default-slice",
      adrs: [],
      rfcs: [],
      tddCycles: [],
    };
  }

  public saveState(): void {
    fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), "utf-8");
  }

  public getState(): QualityGateState {
    return this.state;
  }

  public setPhase(phase: WorkflowPhase): void {
    this.state.currentPhase = phase;
    this.saveState();
  }

  public setSliceName(sliceName: string): void {
    this.state.sliceName = sliceName;
    this.saveState();
  }

  public canTransitionTo(targetPhase: WorkflowPhase): { allowed: boolean; reason?: string } {
    const s = this.state;

    switch (targetPhase) {
      case "BDD_SPECIFICATION":
        return { allowed: true };

      case "BDD_RED_VERIFICATION":
        if (!s.bddSpec || s.bddSpec.scenarios.length === 0) {
          return { allowed: false, reason: "BDD specification features/scenarios must be defined first." };
        }
        const unresolved = s.bddSpec.clarifyingQuestions.filter((q) => !q.resolved);
        if (unresolved.length > 0) {
          return {
            allowed: false,
            reason: `There are ${unresolved.length} unresolved clarifying questions regarding acceptance criteria.`,
          };
        }
        return { allowed: true };

      case "MULTI_LENS_TEST_REVIEW":
        if (!s.bddSpec?.isRedVerified) {
          return { allowed: false, reason: "BDD scenarios must be executed and confirmed failing (RED) first." };
        }
        return { allowed: true };

      case "SYSTEM_DESIGN_C4_FORMAL":
        if (!s.testReview || !s.testReview.passed) {
          return { allowed: false, reason: "Multi-lens test review must pass all 4 lenses and slice decomposition (<400 LOC)." };
        }
        return { allowed: true };

      case "ADR_RFC_GOVERNANCE":
        if (!s.c4Spec || !s.formalModel) {
          return { allowed: false, reason: "C4 D2 diagrams and Alloy/TLA+ formal models must be completed first." };
        }
        return { allowed: true };

      case "TDD_UNIT_RED_GREEN":
        if (s.adrs.length === 0) {
          return { allowed: false, reason: "At least one ADR must document key architectural decisions before code writing." };
        }
        const pendingRfcs = s.rfcs.filter((r) => r.status !== "APPROVED");
        if (pendingRfcs.length > 0) {
          return {
            allowed: false,
            reason: `There are ${pendingRfcs.length} open RFCs requiring 6-lens panel approval and human sign-off.`,
          };
        }
        return { allowed: true };

      case "MUTATION_TESTING":
        if (s.tddCycles.length === 0 || !s.tddCycles.every((c) => c.greenVerified)) {
          return { allowed: false, reason: "All TDD unit tests must pass RED/GREEN cycles first." };
        }
        return { allowed: true };

      case "MULTI_LENS_CODE_REVIEW":
        if (!s.mutationResult || !s.mutationResult.passedThreshold) {
          return { allowed: false, reason: "Mutation testing must meet or exceed the 85% mutant kill rate threshold." };
        }
        return { allowed: true };

      case "COMPLETED_LOCKED":
        if (!s.finalReview || !s.finalReview.passed) {
          return { allowed: false, reason: "Post-implementation 7-lens code review and static analysis must pass." };
        }
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  public updateBDDSpec(update?: Partial<QualityGateState["bddSpec"]>): void {
    const u = update || {};
    this.state.bddSpec = {
      featureName: u.featureName || this.state.bddSpec?.featureName || "Feature",
      userStory: u.userStory || this.state.bddSpec?.userStory || "",
      acceptanceCriteria: u.acceptanceCriteria || this.state.bddSpec?.acceptanceCriteria || [],
      scenarios: u.scenarios || this.state.bddSpec?.scenarios || [],
      clarifyingQuestions: u.clarifyingQuestions || this.state.bddSpec?.clarifyingQuestions || [],
      rawGherkin: u.rawGherkin || this.state.bddSpec?.rawGherkin || "",
      isRedVerified: u.isRedVerified ?? this.state.bddSpec?.isRedVerified ?? false,
      redOutput: u.redOutput ?? this.state.bddSpec?.redOutput,
    };
    this.saveState();
  }

  public updateTestReview(review: QualityGateState["testReview"]): void {
    this.state.testReview = review;
    this.saveState();
  }

  public updateC4Spec(c4: QualityGateState["c4Spec"]): void {
    this.state.c4Spec = c4;
    this.saveState();
  }

  public updateFormalModel(model: QualityGateState["formalModel"]): void {
    this.state.formalModel = model;
    this.saveState();
  }

  public addADR(adr: QualityGateState["adrs"][number]): void {
    this.state.adrs.push(adr);
    this.saveState();
  }

  public addOrUpdateRFC(rfc: QualityGateState["rfcs"][number]): void {
    const idx = this.state.rfcs.findIndex((r) => r.id === rfc.id);
    if (idx >= 0) {
      this.state.rfcs[idx] = rfc;
    } else {
      this.state.rfcs.push(rfc);
    }
    this.saveState();
  }

  public addTDDCycle(cycle: QualityGateState["tddCycles"][number]): void {
    const idx = this.state.tddCycles.findIndex((c) => c.unitTestFilePath === cycle.unitTestFilePath);
    if (idx >= 0) {
      this.state.tddCycles[idx] = cycle;
    } else {
      this.state.tddCycles.push(cycle);
    }
    this.saveState();
  }

  public updateMutationResult(res: QualityGateState["mutationResult"]): void {
    this.state.mutationResult = res;
    this.saveState();
  }

  public updateFinalReview(res: QualityGateState["finalReview"]): void {
    this.state.finalReview = res;
    this.saveState();
  }
}
