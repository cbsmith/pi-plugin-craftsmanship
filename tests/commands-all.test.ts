import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { registerCommands } from "../src/commands";

const commandsTestDir = path.join(__dirname, "../tmp_commands_test_project");

describe("Complete Slash Commands Suite Integration Tests", () => {
  let registeredCommands: Record<string, any> = {};
  let notifications: Array<{ msg: string; type: string }> = [];

  beforeEach(() => {
    if (fs.existsSync(commandsTestDir)) {
      fs.rmSync(commandsTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(commandsTestDir, { recursive: true });

    registeredCommands = {};
    notifications = [];

    const mockPi = {
      registerTool: () => {},
      registerCommand: (name: string, def: any) => {
        registeredCommands[name] = def;
      },
      on: () => {},
    };

    registerCommands(mockPi as any);
  });

  const getMockCtx = () => ({
    cwd: commandsTestDir,
    ui: {
      notify: (msg: string, type: string = "info") => {
        notifications.push({ msg, type });
      },
      confirm: async () => true,
      input: async (title: string) => `InputFor:${title}`,
      ask: async (prompt: string) => `AskFor:${prompt}`,
    },
  });

  it("1. /craft-init initializes project directory structure", async () => {
    const cmd = registeredCommands["craft-init"];
    expect(cmd).toBeDefined();

    await cmd.handler("", getMockCtx());

    expect(fs.existsSync(path.join(commandsTestDir, "features"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "specs/c4"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "specs/alloy"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "specs/tla"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "specs/properties"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "docs/adr"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, "docs/rfc"))).toBe(true);
    expect(fs.existsSync(path.join(commandsTestDir, ".craftsmanship"))).toBe(true);
    expect(notifications.some((n) => n.msg.includes("initialized with HARD QUALITY GATES"))).toBe(true);
  });

  it("2. /craft-status displays workflow status dashboard", async () => {
    const cmd = registeredCommands["craft-status"];
    expect(cmd).toBeDefined();

    await cmd.handler("", getMockCtx());

    expect(notifications.some((n) => n.msg.includes("CRAFTSMANSHIP WORKFLOW STATUS"))).toBe(true);
  });

  it("3. /craft-skip records human exemption request and rejection for invalid gate", async () => {
    const cmd = registeredCommands["craft-skip"];
    expect(cmd).toBeDefined();

    // Invalid gate
    await cmd.handler("INVALID_GATE", getMockCtx());
    expect(notifications.some((n) => n.msg.includes("Invalid gate"))).toBe(true);

    // Valid gate
    notifications = [];
    await cmd.handler("FORMAL_METHODS", getMockCtx());
    expect(notifications.some((n) => n.msg.includes("HUMAN EXEMPTION GRANTED"))).toBe(true);
  });

  it("4. /craft-bdd creates BDD feature spec interactively", async () => {
    const cmd = registeredCommands["craft-bdd"];
    expect(cmd).toBeDefined();

    await cmd.handler("PaymentFlow", getMockCtx());

    expect(fs.existsSync(path.join(commandsTestDir, "features/paymentflow.feature"))).toBe(true);
    expect(notifications.some((n) => n.msg.includes("BDD Gherkin feature generated"))).toBe(true);
  });

  it("5. /craft-review-tests checks pre-implementation test review", async () => {
    // Run BDD with edge-case criteria first
    const mockCtx = getMockCtx();
    mockCtx.ui.input = async (title: string) => {
      if (title.includes("Acceptance Criteria")) return "Given null or empty payload when error occurs then handle boundary exception gracefully, Given valid input when submitted then return 200 OK";
      return `InputFor:${title}`;
    };

    await registeredCommands["craft-bdd"].handler("SliceTest", mockCtx);
    notifications = [];

    const cmd = registeredCommands["craft-review-tests"];
    expect(cmd).toBeDefined();

    await cmd.handler("", mockCtx);

    expect(notifications.some((n) => n.msg.includes("test review PASSED"))).toBe(true);
  });

  it("6. /craft-design generates C4 diagrams and formal specs", async () => {
    const cmd = registeredCommands["craft-design"];
    expect(cmd).toBeDefined();

    await cmd.handler("", getMockCtx());

    expect(fs.existsSync(path.join(commandsTestDir, "specs/c4_architecture.d2"))).toBe(true);
    expect(notifications.some((n) => n.msg.includes("C4 D2 diagrams, Alloy/TLA+ specs"))).toBe(true);
  });

  it("7. /craft-rfc creates and approves RFCs", async () => {
    const cmd = registeredCommands["craft-rfc"];
    expect(cmd).toBeDefined();

    // Create RFC
    await cmd.handler("Caching Strategy", getMockCtx());
    expect(notifications.some((n) => n.msg.includes("RFC RFC-0001 evaluated"))).toBe(true);

    // Approve RFC
    notifications = [];
    await cmd.handler("approve RFC-0001", getMockCtx());
    expect(notifications.some((n) => n.msg.includes("RFC RFC-0001 APPROVED"))).toBe(true);
  });

  it("8. /craft-tdd runs self-healing TDD RED/GREEN loop & mutation testing", async () => {
    const cmd = registeredCommands["craft-tdd"];
    expect(cmd).toBeDefined();

    await cmd.handler("", getMockCtx());

    expect(notifications.some((n) => n.msg.includes("Self-healing TDD RED/GREEN loop verified"))).toBe(true);
  });

  it("9. /craft-review executes dialectic post-implementation review", async () => {
    // Setup prerequisite BDD, design, ADR, mutation test state
    const mockCtx = getMockCtx();
    mockCtx.ui.input = async (title: string) => {
      if (title.includes("Acceptance Criteria")) return "Given null or empty payload when error occurs then handle boundary exception gracefully, Given valid input when submitted then return 200 OK";
      return `InputFor:${title}`;
    };

    await registeredCommands["craft-bdd"].handler("ReviewSlice", mockCtx);
    await registeredCommands["craft-review-tests"].handler("", mockCtx);
    await registeredCommands["craft-design"].handler("", mockCtx);
    await registeredCommands["craft-tdd"].handler("", mockCtx);

    const { QualityGateEngine } = await import("../src/core/state-machine");
    const qEngine = new QualityGateEngine(commandsTestDir);
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });

    notifications = [];

    const cmd = registeredCommands["craft-review"];
    expect(cmd).toBeDefined();

    await cmd.handler("", mockCtx);

    expect(notifications.some((n) => n.msg.includes("code review PASSED"))).toBe(true);
  });

  it("10. /craft-slice-review conducts guided human walkthrough and locks slice", async () => {
    // Setup prerequisite phase
    const mockCtx = getMockCtx();
    mockCtx.ui.input = async (title: string) => {
      if (title.includes("Acceptance Criteria")) return "Given null or empty payload when error occurs then handle boundary exception gracefully, Given valid input when submitted then return 200 OK";
      return `InputFor:${title}`;
    };

    await registeredCommands["craft-bdd"].handler("WalkthroughSlice", mockCtx);
    await registeredCommands["craft-review-tests"].handler("", mockCtx);
    await registeredCommands["craft-design"].handler("", mockCtx);
    await registeredCommands["craft-tdd"].handler("", mockCtx);

    const { QualityGateEngine } = await import("../src/core/state-machine");
    const qEngine = new QualityGateEngine(commandsTestDir);
    qEngine.addADR({ id: "0001", title: "ADR 1", status: "ACCEPTED", context: "ctx", decision: "dec", consequences: [], date: "2026-09-05" });

    await registeredCommands["craft-review"].handler("", mockCtx);
    notifications = [];

    const cmd = registeredCommands["craft-slice-review"];
    expect(cmd).toBeDefined();

    await cmd.handler("", mockCtx);

    expect(notifications.some((n) => n.msg.includes("APPROVED and LOCKED"))).toBe(true);
  });
});
