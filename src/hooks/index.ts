import { QualityGateEngine } from "../core/state-machine";
import { ExtensionAPI, ExtensionContext } from "../types";

export function registerHooks(pi: ExtensionAPI): void {

  // Event Hook 1: Session / Agent Initialization
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    const qEngine = new QualityGateEngine(ctx.cwd);
    const state = qEngine.getState();

    ctx.ui.notify(
      `Craftsmanship Plugin Active (HARD GATES ENFORCED). Current Phase: ${state.currentPhase} (Slice: ${state.sliceName})`,
      "info"
    );
  });

  // Event Hook 2: Hard Gate Interception Hook
  pi.on("before_tool_call", async (event: any, ctx: ExtensionContext) => {
    const toolName = event.name || event.toolName;
    const args = event.parameters || event.args || {};

    // Check if writing or editing source implementation files
    if ((toolName === "write_to_file" || toolName === "replace_file_content" || toolName === "multi_replace_file_content") && args.TargetFile) {
      const targetFile = String(args.TargetFile);

      const isSourceCode =
        (targetFile.includes("/src/") || targetFile.includes("/lib/")) &&
        !targetFile.includes(".test.") &&
        !targetFile.includes(".spec.");

      if (isSourceCode) {
        const qEngine = new QualityGateEngine(ctx.cwd);
        const check = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");

        if (!check.allowed) {
          ctx.ui.notify(`HARD QUALITY GATE BLOCKED: ${check.reason}`, "error");

          // HARD GATE ENFORCEMENT: Throw error to reject tool call execution
          throw new Error(
            `[CRAFTSMANSHIP HARD GATE BLOCK]: Attempting to write implementation code in '${targetFile}' before completing required engineering phases. ${check.reason}`
          );
        }
      }
    }
  });
}
