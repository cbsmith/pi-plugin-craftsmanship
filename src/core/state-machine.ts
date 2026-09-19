import * as fs from "fs";
import * as path from "path";
import { ExemptableGate, QualityGateExemption, QualityGateState, WorkflowPhase } from "../types";

export class QualityGateEngine {
  private stateFilePath: string;
  private lockFilePath: string;
  private eventLogPath: string;
  private state: QualityGateState;

  constructor(projectRoot: string = process.cwd()) {
    const root = projectRoot || process.cwd();
    const craftDir = path.join(root, ".craftsmanship");
    if (!fs.existsSync(craftDir)) {
      fs.mkdirSync(craftDir, { recursive: true });
    }
    this.stateFilePath = path.join(craftDir, "state.json");
    this.lockFilePath = path.join(craftDir, "state.json.lock");
    this.eventLogPath = path.join(craftDir, "events.jsonl");
    this.state = this.loadState();
  }

  private acquireFileLock(): void {
    const maxRetries = 50;
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Exclusive creation mode ('wx') guarantees atomic lock acquisition across processes/threads
        const fd = fs.openSync(this.lockFilePath, "wx");
        fs.closeSync(fd);
        return;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          // Check for stale lock older than 5 seconds
          try {
            const stat = fs.statSync(this.lockFilePath);
            if (Date.now() - stat.mtimeMs > 5000) {
              fs.unlinkSync(this.lockFilePath);
              continue;
            }
          } catch {}
          // Wait 10ms before retrying
          const start = Date.now();
          while (Date.now() - start < 10) {}
        } else {
          break;
        }
      }
    }
  }

  private releaseFileLock(): void {
    if (fs.existsSync(this.lockFilePath)) {
      try {
        fs.unlinkSync(this.lockFilePath);
      } catch {}
    }
  }

  private logEvent(eventType: string, payload: any): void {
    try {
      const eventEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        eventType,
        payload,
      }) + "\n";
      fs.appendFileSync(this.eventLogPath, eventEntry, "utf-8");
    } catch {}
  }

  private loadState(): QualityGateState {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          exemptions: [],
          adrs: [],
          rfcs: [],
          tddCycles: [],
          ...parsed,
        };
      } catch {
        // Return default state on parse error
      }
    }
    return {
      currentPhase: "UNINITIALIZED",
      sliceName: "default-slice",
      hardGateEnforced: true,
      exemptions: [],
      adrs: [],
      rfcs: [],
      tddCycles: [],
    };
  }

  public saveState(): void {
    this.acquireFileLock();
    try {
      // Atomic Write: Write to temporary file then rename to prevent state corruption on process interruption
      const tmpPath = `${this.stateFilePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.stateFilePath);
      this.logEvent("STATE_SAVED", { phase: this.state.currentPhase, sliceName: this.state.sliceName });
    } finally {
      this.releaseFileLock();
    }
  }

  public getState(): QualityGateState {
    this.state = this.loadState(); // Ensure fresh state reloaded from disk
    return this.state;
  }

  public setPhase(phase: WorkflowPhase): void {
    this.getState();
    this.state.currentPhase = phase;
    this.saveState();
  }

  public setSliceName(sliceName: string): void {
    this.getState();
    this.state.sliceName = sliceName;
    this.saveState();
  }

  public setHardGateEnforced(enforced: boolean): void {
    this.getState();
    this.state.hardGateEnforced = enforced;
    this.saveState();
  }

  public hasApprovedExemption(gate: ExemptableGate): boolean {
    return (this.getState().exemptions || []).some((e) => e.gate === gate && e.humanApproved);
  }

  public recordExemption(exemption: QualityGateExemption): void {
    this.getState();
    if (!this.state.exemptions) {
      this.state.exemptions = [];
    }
    const idx = this.state.exemptions.findIndex((e) => e.gate === exemption.gate);
    if (idx >= 0) {
      this.state.exemptions[idx] = exemption;
    } else {
      this.state.exemptions.push(exemption);
    }
    this.saveState();
  }

  public canTransitionTo(targetPhase: WorkflowPhase): { allowed: boolean; reason?: string } {
    const s = this.getState();

    switch (targetPhase) {
      case "BDD_SPECIFICATION":
        return { allowed: true };

      case "BDD_RED_VERIFICATION":
        if (!s.bddSpec || s.bddSpec.scenarios.length === 0) {
          return { allowed: false, reason: "HARD GATE BLOCKED: BDD specification features/scenarios must be defined first." };
        }
        const unresolved = s.bddSpec.clarifyingQuestions.filter((q) => !q.resolved);
        if (unresolved.length > 0) {
          return {
            allowed: false,
            reason: `HARD GATE BLOCKED: There are ${unresolved.length} unresolved clarifying questions regarding acceptance criteria.`,
          };
        }
        return { allowed: true };

      case "MULTI_LENS_TEST_REVIEW":
        if (!s.bddSpec?.isRedVerified) {
          return { allowed: false, reason: "HARD GATE BLOCKED: BDD scenarios must be executed and confirmed failing (RED) first." };
        }
        return { allowed: true };

      case "SYSTEM_DESIGN_C4_FORMAL":
        if (!s.testReview || !s.testReview.passed) {
          const blockers = s.testReview?.objections.filter((o) => o.severity === "BLOCKER" && !o.addressed) || [];
          return {
            allowed: false,
            reason: `HARD GATE BLOCKED: Multi-lens test review has ${blockers.length} unresolved BLOCKER objection(s) or exceeds the <400 LOC slice limit.`,
          };
        }
        return { allowed: true };

      case "ADR_RFC_GOVERNANCE":
        const hasC4 = !!s.c4Spec || this.hasApprovedExemption("C4_DIAGRAMS");
        const hasFormal = !!s.formalModel || this.hasApprovedExemption("FORMAL_METHODS");

        if (!hasC4 || !hasFormal) {
          return {
            allowed: false,
            reason: "HARD GATE BLOCKED: C4 D2 diagrams and Alloy/TLA+ formal models must be completed first (or have explicit HUMAN-APPROVED exemptions).",
          };
        }

        if (s.formalModel?.counterexample && !this.hasApprovedExemption("FORMAL_METHODS")) {
          return {
            allowed: false,
            reason: `HARD GATE BLOCKED: TLC/Alloy model checker found a state counterexample trace violating invariant '${s.formalModel.counterexample.invariantViolated}'. Must resolve in formal spec first!`,
          };
        }
        if (s.formalModel && !s.formalModel.completenessEvaluation.isComplete && !this.hasApprovedExemption("FORMAL_METHODS")) {
          return {
            allowed: false,
            reason: `HARD GATE BLOCKED: Formal methods model is incomplete. Unmodeled state transitions: ${s.formalModel.completenessEvaluation.unmodeledStateTransitions.join(", ")}`,
          };
        }
        return { allowed: true };

      case "TDD_UNIT_RED_GREEN":
        const hasADR = s.adrs.length > 0 || this.hasApprovedExemption("ADR_DOCUMENTATION");
        if (!hasADR) {
          return { allowed: false, reason: "HARD GATE BLOCKED: At least one ADR must document key architectural decisions before code writing (or have explicit HUMAN-APPROVED exemption)." };
        }
        if (!this.hasApprovedExemption("RFC_GOVERNANCE")) {
          const pendingRfcs = s.rfcs.filter((r) => r.status !== "APPROVED" || !r.humanApproved);
          if (pendingRfcs.length > 0) {
            return {
              allowed: false,
              reason: `HARD GATE BLOCKED: ${pendingRfcs.length} open RFC(s) require dialectic agent panel approval AND human sign-off.`,
            };
          }
        }
        return { allowed: true };

      case "MUTATION_TESTING":
        if (s.tddCycles.length === 0 || !s.tddCycles.every((c) => c.greenVerified)) {
          return { allowed: false, reason: "HARD GATE BLOCKED: All TDD unit tests must pass RED/GREEN cycles first." };
        }
        return { allowed: true };

      case "MULTI_LENS_CODE_REVIEW":
        if (!s.mutationResult || !s.mutationResult.passedThreshold) {
          return { allowed: false, reason: "HARD GATE BLOCKED: Mutation testing must meet or exceed the 85% mutant kill rate threshold." };
        }
        return { allowed: true };

      case "GUIDED_HUMAN_SLICE_REVIEW":
        if (!s.finalReview || !s.finalReview.passed) {
          return { allowed: false, reason: "HARD GATE BLOCKED: Post-implementation dialectic code review & static analysis have unresolved BLOCKER objections." };
        }
        if (s.driftReport?.hasDrift) {
          return { allowed: false, reason: "HARD GATE BLOCKED: Architectural drift detected! Code structure conflicts with C4 diagrams and ADRs." };
        }
        return { allowed: true };

      case "COMPLETED_LOCKED":
        if (!s.humanSliceReview || !s.humanSliceReview.approved) {
          return { allowed: false, reason: "HARD GATE BLOCKED: Slice requires a GUIDED HUMAN REVIEW walkthrough and sign-off before completion!" };
        }
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  public updateBDDSpec(update?: Partial<QualityGateState["bddSpec"]>): void {
    this.getState();
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
    this.getState();
    this.state.testReview = review;
    this.saveState();
  }

  public updateC4Spec(c4: QualityGateState["c4Spec"]): void {
    this.getState();
    this.state.c4Spec = c4;
    this.saveState();
  }

  public updateFormalModel(model: QualityGateState["formalModel"]): void {
    this.getState();
    this.state.formalModel = model;
    this.saveState();
  }

  public addADR(adr: QualityGateState["adrs"][number]): void {
    this.getState();
    this.state.adrs.push(adr);
    this.saveState();
  }

  public addOrUpdateRFC(rfc: QualityGateState["rfcs"][number]): void {
    this.getState();
    const idx = this.state.rfcs.findIndex((r) => r.id === rfc.id);
    if (idx >= 0) {
      this.state.rfcs[idx] = rfc;
    } else {
      this.state.rfcs.push(rfc);
    }
    this.saveState();
  }

  public addTDDCycle(cycle: QualityGateState["tddCycles"][number]): void {
    this.getState();
    const idx = this.state.tddCycles.findIndex((c) => c.unitTestFilePath === cycle.unitTestFilePath);
    if (idx >= 0) {
      this.state.tddCycles[idx] = cycle;
    } else {
      this.state.tddCycles.push(cycle);
    }
    this.saveState();
  }

  public updateMutationResult(res: QualityGateState["mutationResult"]): void {
    this.getState();
    this.state.mutationResult = res;
    this.saveState();
  }

  public updateDriftReport(report: QualityGateState["driftReport"]): void {
    this.getState();
    this.state.driftReport = report;
    this.saveState();
  }

  public updateFinalReview(res: QualityGateState["finalReview"]): void {
    this.getState();
    this.state.finalReview = res;
    this.saveState();
  }

  public recordHumanSliceReview(record: QualityGateState["humanSliceReview"]): void {
    this.getState();
    this.state.humanSliceReview = record;
    this.saveState();
  }
}
