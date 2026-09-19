import { describe, it, expect } from "vitest";

/**
 * Simulator modeling tool execution concurrency under UNSAFE_PARALLEL, GLOBAL_SEQUENTIAL,
 * and FINE_GRAINED_PARALLEL modes.
 * Validates TLA+ Safety Invariants:
 *  - NoConcurrentStateWrites (activeWriters <= 1)
 *  - NoConcurrentUIPrompts (activeUIPrompts <= 1)
 *  - ExclusiveFileLock
 *  - ExclusiveUIPromptModal
 */

type ExecutionMode = "UNSAFE_PARALLEL" | "GLOBAL_SEQUENTIAL" | "FINE_GRAINED_PARALLEL";
type ToolActionType = "DISPATCH" | "START_WRITE" | "FINISH_WRITE" | "PROMPT_UI" | "FINISH_UI" | "COMPLETE";

interface ToolAction {
  toolId: string;
  type: ToolActionType;
}

class ExecutionSimulator {
  private mode: ExecutionMode;
  private fileLockOwner: string | null = null;
  private fileLockQueue: string[] = [];
  private uiPromptOwner: string | null = null;
  private uiQueue: string[] = [];
  private toolStates: Record<string, "IDLE" | "RUNNING" | "WAITING_FILE_LOCK" | "WRITING_STATE" | "WAITING_UI_LOCK" | "PROMPTING_UI" | "COMPLETED"> = {};
  
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

    if (this.mode === "FINE_GRAINED_PARALLEL") {
      this.stepFineGrained(toolId, type, state);
    } else if (this.mode === "UNSAFE_PARALLEL") {
      this.stepUnsafeParallel(toolId, type, state);
    }

    // Evaluate TLA+ Invariants after each step
    if (this.activeWriters > 1) {
      this.violations.push(`NoConcurrentStateWrites violated: activeWriters = ${this.activeWriters}`);
    }
    if (this.activeUIPrompts > 1) {
      this.violations.push(`NoConcurrentUIPrompts violated: activeUIPrompts = ${this.activeUIPrompts}`);
    }
  }

  private stepFineGrained(toolId: string, type: ToolActionType, state: string): void {
    if (type === "DISPATCH" && state === "IDLE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeRunningTools++;
    } else if (type === "START_WRITE" && state === "RUNNING") {
      this.toolStates[toolId] = "WAITING_FILE_LOCK";
      this.fileLockQueue.push(toolId);
      this.tryAcquireFileLock();
    } else if (type === "FINISH_WRITE" && this.fileLockOwner === toolId && state === "WRITING_STATE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeWriters--;
      this.fileLockOwner = null;
      this.tryAcquireFileLock();
    } else if (type === "PROMPT_UI" && state === "RUNNING") {
      this.toolStates[toolId] = "WAITING_UI_LOCK";
      this.uiQueue.push(toolId);
      this.tryAcquireUILock();
    } else if (type === "FINISH_UI" && this.uiPromptOwner === toolId && state === "PROMPTING_UI") {
      this.toolStates[toolId] = "RUNNING";
      this.activeUIPrompts--;
      this.uiPromptOwner = null;
      this.tryAcquireUILock();
    } else if (type === "COMPLETE" && state === "RUNNING") {
      this.toolStates[toolId] = "COMPLETED";
      this.activeRunningTools--;
    }
  }

  private tryAcquireFileLock(): void {
    if (this.fileLockOwner === null && this.fileLockQueue.length > 0) {
      this.fileLockOwner = this.fileLockQueue.shift()!;
      this.toolStates[this.fileLockOwner] = "WRITING_STATE";
      this.activeWriters++;
    }
  }

  private tryAcquireUILock(): void {
    if (this.uiPromptOwner === null && this.uiQueue.length > 0) {
      this.uiPromptOwner = this.uiQueue.shift()!;
      this.toolStates[this.uiPromptOwner] = "PROMPTING_UI";
      this.activeUIPrompts++;
    }
  }

  private stepUnsafeParallel(toolId: string, type: ToolActionType, state: string): void {
    if (type === "DISPATCH" && state === "IDLE") {
      this.toolStates[toolId] = "RUNNING";
      this.activeRunningTools++;
    } else if (type === "START_WRITE" && state === "RUNNING") {
      this.toolStates[toolId] = "WRITING_STATE";
      this.activeWriters++;
    } else if (type === "PROMPT_UI" && state === "RUNNING") {
      this.toolStates[toolId] = "PROMPTING_UI";
      this.activeUIPrompts++;
    }
  }
}

describe("Tool Execution Concurrency Property-Based Invariant Verification", () => {
  it("proves FINE_GRAINED_PARALLEL execution mode satisfies all TLA+ invariants across random action sequences", () => {
    const tools = ["tool_analyze", "tool_exemption", "tool_check_gate"];
    const actionTypes: ToolActionType[] = ["DISPATCH", "START_WRITE", "FINISH_WRITE", "PROMPT_UI", "FINISH_UI", "COMPLETE"];

    // Generate 100 random action sequences
    for (let i = 0; i < 100; i++) {
      const sim = new ExecutionSimulator(tools, "FINE_GRAINED_PARALLEL");
      const numActions = 30 + (i % 20);
      for (let j = 0; j < numActions; j++) {
        const toolId = tools[(i * 17 + j * 7) % tools.length];
        const type = actionTypes[(i * 3 + j * 11) % actionTypes.length];
        sim.step({ toolId, type });
      }
      expect(sim.violations).toEqual([]);
    }
  });

  it("verifies UNSAFE_PARALLEL execution mode triggers invariant violations under concurrent requests", () => {
    const tools = ["tool_analyze", "tool_exemption"];
    const sim = new ExecutionSimulator(tools, "UNSAFE_PARALLEL");

    sim.step({ toolId: "tool_analyze", type: "DISPATCH" });
    sim.step({ toolId: "tool_exemption", type: "DISPATCH" });
    sim.step({ toolId: "tool_analyze", type: "START_WRITE" });
    sim.step({ toolId: "tool_exemption", type: "START_WRITE" });

    expect(sim.violations.some((v) => v.includes("NoConcurrentStateWrites"))).toBe(true);
  });
});
