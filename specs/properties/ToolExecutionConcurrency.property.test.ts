import { describe, it, expect } from "vitest";

/**
 * Simulator modeling tool execution concurrency under PARALLEL vs SEQUENTIAL modes.
 * Validates TLA+ Safety Invariants:
 *  - NoConcurrentStateWrites (activeWriters <= 1)
 *  - NoConcurrentUIPrompts (activeUIPrompts <= 1)
 *  - StrictMutexIsolation (activeRunningTools <= 1 in SEQUENTIAL mode)
 *  - NoStateWriteDuringUIPrompt (~(activeWriters > 0 && activeUIPrompts > 0))
 */

type ExecutionMode = "PARALLEL" | "SEQUENTIAL";
type ToolActionType = "DISPATCH" | "START_WRITE" | "FINISH_WRITE" | "PROMPT_UI" | "FINISH_UI" | "COMPLETE";

interface ToolAction {
  toolId: string;
  type: ToolActionType;
}

class ExecutionSimulator {
  private mode: ExecutionMode;
  private queue: string[] = [];
  private activeTool: string | null = null;
  private toolStates: Record<string, "IDLE" | "QUEUED" | "RUNNING" | "WRITING_STATE" | "PROMPTING_UI" | "COMPLETED"> = {};
  
  public activeWriters = 0;
  public activeUIPrompts = 0;
  public activeRunningTools = 0;
  public violations: string[] = [];

  constructor(tools: string[], mode: ExecutionMode) {
    this.mode = mode;
    for (const t of tools) {
      this.toolStates[t] = "IDLE";
    }
  }

  public step(action: ToolAction): void {
    const { toolId, type } = action;
    if (!(toolId in this.toolStates)) return;
    const state = this.toolStates[toolId];

    if (this.mode === "SEQUENTIAL") {
      this.stepSequential(toolId, type, state);
    } else {
      this.stepParallel(toolId, type, state);
    }

    // Evaluate TLA+ Invariants after each step
    if (this.activeWriters > 1) {
      this.violations.push(`NoConcurrentStateWrites violated: activeWriters = ${this.activeWriters}`);
    }
    if (this.activeUIPrompts > 1) {
      this.violations.push(`NoConcurrentUIPrompts violated: activeUIPrompts = ${this.activeUIPrompts}`);
    }
    if (this.mode === "SEQUENTIAL" && this.activeRunningTools > 1) {
      this.violations.push(`StrictMutexIsolation violated: activeRunningTools = ${this.activeRunningTools}`);
    }
    if (this.activeWriters > 0 && this.activeUIPrompts > 0) {
      this.violations.push(`NoStateWriteDuringUIPrompt violated: activeWriters=${this.activeWriters}, activeUIPrompts=${this.activeUIPrompts}`);
    }
  }

  private stepParallel(toolId: string, type: ToolActionType, state: string): void {
    if (type === "DISPATCH" && state === "IDLE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeRunningTools++;
    } else if (type === "START_WRITE" && state === "RUNNING") {
      this.toolStates[toolId] = "WRITING_STATE";
      this.activeWriters++;
    } else if (type === "FINISH_WRITE" && state === "WRITING_STATE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeWriters--;
    } else if (type === "PROMPT_UI" && state === "RUNNING") {
      this.toolStates[toolId] = "PROMPTING_UI";
      this.activeUIPrompts++;
    } else if (type === "FINISH_UI" && state === "PROMPTING_UI") {
      this.toolStates[toolId] = "RUNNING";
      this.activeUIPrompts--;
    } else if (type === "COMPLETE" && state === "RUNNING") {
      this.toolStates[toolId] = "COMPLETED";
      this.activeRunningTools--;
    }
  }

  private stepSequential(toolId: string, type: ToolActionType, state: string): void {
    if (type === "DISPATCH" && state === "IDLE") {
      this.toolStates[toolId] = "QUEUED";
      this.queue.push(toolId);
      this.tryAcquireLock();
    } else if (type === "START_WRITE" && this.activeTool === toolId && state === "RUNNING") {
      this.toolStates[toolId] = "WRITING_STATE";
      this.activeWriters++;
    } else if (type === "FINISH_WRITE" && this.activeTool === toolId && state === "WRITING_STATE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeWriters--;
    } else if (type === "PROMPT_UI" && this.activeTool === toolId && state === "RUNNING") {
      this.toolStates[toolId] = "PROMPTING_UI";
      this.activeUIPrompts++;
    } else if (type === "FINISH_UI" && this.activeTool === toolId && state === "PROMPTING_UI") {
      this.toolStates[toolId] = "RUNNING";
      this.activeUIPrompts--;
    } else if (type === "COMPLETE" && this.activeTool === toolId && state === "RUNNING") {
      this.toolStates[toolId] = "COMPLETED";
      this.activeRunningTools--;
      this.activeTool = null;
      this.tryAcquireLock();
    }
  }

  private tryAcquireLock(): void {
    if (this.activeTool === null && this.queue.length > 0) {
      this.activeTool = this.queue.shift()!;
      this.toolStates[this.activeTool] = "RUNNING";
      this.activeRunningTools++;
    }
  }
}

describe("Tool Execution Concurrency Property-Based Invariant Verification", () => {
  it("proves SEQUENTIAL execution mode satisfies all TLA+ invariants across generated action sequences", () => {
    const tools = ["tool_analyze", "tool_exemption", "tool_check_gate"];
    const actionTypes: ToolActionType[] = ["DISPATCH", "START_WRITE", "FINISH_WRITE", "PROMPT_UI", "FINISH_UI", "COMPLETE"];

    // Generate 100 random action sequences
    for (let i = 0; i < 100; i++) {
      const sim = new ExecutionSimulator(tools, "SEQUENTIAL");
      const numActions = 20 + (i % 30);
      for (let j = 0; j < numActions; j++) {
        const toolId = tools[(i * 17 + j * 7) % tools.length];
        const type = actionTypes[(i * 3 + j * 11) % actionTypes.length];
        sim.step({ toolId, type });
      }
      expect(sim.violations).toEqual([]);
    }
  });

  it("verifies PARALLEL execution mode triggers invariant violations under concurrent requests", () => {
    const tools = ["tool_analyze", "tool_exemption"];
    const sim = new ExecutionSimulator(tools, "PARALLEL");

    sim.step({ toolId: "tool_analyze", type: "DISPATCH" });
    sim.step({ toolId: "tool_exemption", type: "DISPATCH" });
    sim.step({ toolId: "tool_analyze", type: "START_WRITE" });
    sim.step({ toolId: "tool_exemption", type: "START_WRITE" });

    expect(sim.violations.some((v) => v.includes("NoConcurrentStateWrites"))).toBe(true);
  });
});
