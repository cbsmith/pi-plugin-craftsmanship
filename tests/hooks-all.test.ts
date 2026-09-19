import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { registerHooks } from "../src/hooks";
import { QualityGateEngine } from "../src/core/state-machine";

const hooksTestDir = path.join(__dirname, "../tmp_hooks_test_project");

describe("Event Hooks Suite Integration Tests", () => {
  let registeredHooks: Record<string, Function> = {};
  let notifications: Array<{ msg: string; type: string }> = [];

  beforeEach(() => {
    if (fs.existsSync(hooksTestDir)) {
      fs.rmSync(hooksTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(hooksTestDir, { recursive: true });

    registeredHooks = {};
    notifications = [];

    const mockPi = {
      registerTool: () => {},
      registerCommand: () => {},
      on: (event: string, handler: Function) => {
        registeredHooks[event] = handler;
      },
    };

    registerHooks(mockPi as any);
  });

  const getMockCtx = () => ({
    cwd: hooksTestDir,
    ui: {
      notify: (msg: string, type: string = "info") => {
        notifications.push({ msg, type });
      },
      confirm: async () => true,
      input: async () => "MockInput",
      ask: async () => "MockAsk",
    },
  });

  it("1. session_start hook sends notification of craftsmanship status", async () => {
    const hook = registeredHooks["session_start"];
    expect(hook).toBeDefined();

    await hook({}, getMockCtx());

    expect(notifications.some((n) => n.msg.includes("Craftsmanship Plugin Active (HARD GATES ENFORCED)"))).toBe(true);
  });

  it("2. before_tool_call hook intercepts write_to_file targeting implementation code when unapproved", async () => {
    const hook = registeredHooks["before_tool_call"];
    expect(hook).toBeDefined();

    // 1. Target implementation file (src/index.ts) without prerequisite quality gates -> MUST THROW BLOCK
    const eventImpl = {
      name: "write_to_file",
      parameters: { TargetFile: path.join(hooksTestDir, "src/index.ts") },
    };

    await expect(hook(eventImpl, getMockCtx())).rejects.toThrow("[CRAFTSMANSHIP HARD GATE BLOCK]");
    expect(notifications.some((n) => n.msg.includes("HARD QUALITY GATE BLOCKED"))).toBe(true);
  });

  it("3. before_tool_call hook allows write_to_file targeting exempt directories (specs, docs, tests, features)", async () => {
    const hook = registeredHooks["before_tool_call"];
    expect(hook).toBeDefined();

    const exemptPaths = [
      "specs/c4.d2",
      "docs/adr/0001.md",
      "features/auth.feature",
      "tests/auth.test.ts",
      ".craftsmanship/state.json",
    ];

    for (const rel of exemptPaths) {
      const eventExempt = {
        name: "write_to_file",
        parameters: { TargetFile: path.join(hooksTestDir, rel) },
      };
      // Should NOT throw
      await expect(hook(eventExempt, getMockCtx())).resolves.not.toThrow();
    }
  });

  it("4. before_tool_call hook allows writing source code once workflow phase reaches TDD_UNIT_RED_GREEN", async () => {
    const hook = registeredHooks["before_tool_call"];
    expect(hook).toBeDefined();

    // Advance state machine to TDD_UNIT_RED_GREEN phase
    const qEngine = new QualityGateEngine(hooksTestDir);
    qEngine.updateBDDSpec({ featureName: "Slice", userStory: "Story", acceptanceCriteria: ["ac"], scenarios: [], clarifyingQuestions: [], rawGherkin: "", isRedVerified: true });
    qEngine.updateTestReview({ passed: true, objections: [], summary: "Pass", reReviewRequired: false, iterationCount: 1, sliceDecomposition: { sliceName: "Slice", estimatedLOC: 100, isWithinLimit: true, sliceComponents: [] } });
    qEngine.updateC4Spec({ contextD2: "d2", containerD2: "d2", componentD2: "d2", codeD2: "d2", generatedFromCode: true });
    qEngine.updateFormalModel({ alloyModel: "als", tlaModule: "tla", tlaConfig: "cfg", propertyTestSpec: "spec", invariants: [], completenessEvaluation: { isComplete: true, unmodeledStateTransitions: [], critique: "Complete" }, provedAbstractly: true });
    qEngine.addADR({ id: "0001", title: "ADR", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });
    qEngine.setPhase("TDD_UNIT_RED_GREEN");

    const eventImpl = {
      name: "write_to_file",
      parameters: { TargetFile: path.join(hooksTestDir, "src/service.ts") },
    };

    // Should NOT throw now because phase is allowed
    await expect(hook(eventImpl, getMockCtx())).resolves.not.toThrow();
  });
});
