import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { registerTools } from "../src/tools";

const toolsTestDir = path.join(__dirname, "../tmp_tools_test_project");

describe("Complete Tool Suite Integration Tests", () => {
  let registeredTools: Record<string, any> = {};

  beforeEach(() => {
    if (fs.existsSync(toolsTestDir)) {
      fs.rmSync(toolsTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(toolsTestDir, { recursive: true });

    registeredTools = {};
    const mockPi = {
      registerTool: (tool: any) => {
        registeredTools[tool.name] = tool;
      },
      registerCommand: () => {},
      on: () => {},
    };

    registerTools(mockPi as any);
  });

  const getMockCtx = () => ({
    cwd: toolsTestDir,
    ui: {
      notify: () => {},
      confirm: async () => true,
      input: async () => "MockInputResponse",
      ask: async () => "MockAskResponse",
    },
  });

  const mockSignal = new AbortController().signal;
  const mockOnUpdate = () => {};

  it("1. craft_analyze_requirements executes and creates BDD feature file", async () => {
    const tool = registeredTools["craft_analyze_requirements"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-1",
      {
        featureName: "PaymentGateway",
        userStory: "As a user I want to pay online So that I can purchase items",
        acceptanceCriteria: ["Must process fast transactions", "Must handle errors gracefully"],
      },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("BDD Feature spec generated");
    expect(result.content[0].text).toContain("clarifying question(s) identified");
    expect(fs.existsSync(path.join(toolsTestDir, "features/paymentgateway.feature"))).toBe(true);
  });

  it("2. craft_review_tests fails if BDD spec is missing, and passes when present", async () => {
    const tool = registeredTools["craft_review_tests"];
    expect(tool).toBeDefined();

    // Missing BDD spec error check
    const errorRes = await tool.execute("call-2a", { estimatedLOC: 150 }, mockSignal, mockOnUpdate, getMockCtx());
    expect(errorRes.content[0].text).toContain("ERROR: BDD Feature Spec must be created first");

    // First generate BDD spec
    await registeredTools["craft_analyze_requirements"].execute(
      "call-2b",
      { featureName: "TestSlice", userStory: "Story", acceptanceCriteria: ["AC 1"] },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    // Now test review should run
    const successRes = await tool.execute("call-2c", { estimatedLOC: 200 }, mockSignal, mockOnUpdate, getMockCtx());
    expect(successRes.content[0].text).toContain("Pre-Implementation Dialectic Test Review Report");
  });

  it("3. craft_request_gate_exemption records human approved exemption", async () => {
    const tool = registeredTools["craft_request_gate_exemption"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-3",
      { gate: "FORMAL_METHODS", riskAssessment: "Minor UI component" },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("EXEMPTION GRANTED");
  });

  it("4. craft_generate_c4_d2 generates D2 diagrams", async () => {
    const tool = registeredTools["craft_generate_c4_d2"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-4",
      { sliceName: "AuthModule", sourceFiles: [] },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("C4 D2 diagrams generated from code AST");
    expect(fs.existsSync(path.join(toolsTestDir, "specs/c4_architecture.d2"))).toBe(true);
  });

  it("5. craft_generate_formal_spec generates Alloy, TLA+, and property specs", async () => {
    const tool = registeredTools["craft_generate_formal_spec"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-5",
      { sliceName: "StateSync", invariants: ["Inv 1"], simulateCounterexample: false },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Formal Methods Specifications Generated");
    expect(fs.existsSync(path.join(toolsTestDir, "specs/alloy/StateSync.als"))).toBe(true);
    expect(fs.existsSync(path.join(toolsTestDir, "specs/tla/StateSync.tla"))).toBe(true);
  });

  it("6. craft_create_adr creates an ADR record", async () => {
    const tool = registeredTools["craft_create_adr"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-6",
      {
        title: "Use Vitest for Unit Testing",
        context: "Need fast TypeScript test runner",
        decision: "Adopt Vitest",
        consequences: ["Fast execution", "ESM support"],
      },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("ADR #0001 created");
    expect(fs.existsSync(path.join(toolsTestDir, "docs/adr/0001-use-vitest-for-unit-testing.md"))).toBe(true);
  });

  it("7. craft_run_rfc_panel evaluates RFC across dialectic lenses", async () => {
    const tool = registeredTools["craft_run_rfc_panel"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-7",
      {
        rfcId: "RFC-0001",
        title: "Event-Driven Architecture",
        strategyDescription: "Use NATS message bus for asynchronous communication",
        tradeOffs: ["Increased operational complexity"],
      },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("RFC RFC-0001 Dialectic Agent Panel Review");
    expect(fs.existsSync(path.join(toolsTestDir, "docs/rfc/RFC-0001-event-driven-architecture.md"))).toBe(true);
  });

  it("8. craft_auto_tdd_loop runs RED/GREEN verification", async () => {
    const tool = registeredTools["craft_auto_tdd_loop"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-8",
      {
        unitTestFilePath: "tests/unit.test.ts",
        implementationFilePath: "src/impl.ts",
        redLog: "FAIL src/impl.ts - ReferenceError: Impl is not defined",
        greenLog: "PASS tests/unit.test.ts",
      },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Self-Healing TDD Iteration Loop Results");
    expect(result.content[0].text).toContain("RED Verification: PASSED");
  });

  it("9. craft_run_mutation_tests evaluates mutant kill rate", async () => {
    const tool = registeredTools["craft_run_mutation_tests"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-9",
      { testCode: "describe(...)", implCode: "class Auth {}" },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Mutation Testing Report");
    expect(result.content[0].text).toContain("Mutant Kill Rate");
  });

  it("10. craft_run_code_review evaluates post-implementation dialectic review", async () => {
    const tool = registeredTools["craft_run_code_review"];
    expect(tool).toBeDefined();

    // Generate prerequisite BDD & review state
    await registeredTools["craft_analyze_requirements"].execute("c10a", { featureName: "Feat", userStory: "Story", acceptanceCriteria: ["ac"] }, mockSignal, mockOnUpdate, getMockCtx());
    await registeredTools["craft_review_tests"].execute("c10b", { estimatedLOC: 100 }, mockSignal, mockOnUpdate, getMockCtx());

    const result = await tool.execute(
      "call-10",
      { codeContent: "export class Feat {}", testContent: "describe('Feat', () => {})" },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Post-Implementation Dialectic Code Review");
  });

  it("11. craft_guided_human_slice_review records human walkthrough sign-off", async () => {
    const tool = registeredTools["craft_guided_human_slice_review"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-11",
      { reviewerName: "Lead Arch", notes: "Approved for deployment", approved: true },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Guided Human Slice Review Record");
    expect(result.content[0].text).toContain("APPROVED & LOCKED");
  });

  it("12. craft_check_gate returns quality gate status and transition check", async () => {
    const tool = registeredTools["craft_check_gate"];
    expect(tool).toBeDefined();

    const result = await tool.execute(
      "call-12",
      { targetPhase: "TDD_UNIT_RED_GREEN" },
      mockSignal,
      mockOnUpdate,
      getMockCtx()
    );

    expect(result.content[0].text).toContain("Current Workflow Phase");
    expect(result.content[0].text).toContain("Transition Check to 'TDD_UNIT_RED_GREEN'");
  });
});
