import * as path from "path";
import { QualityGateEngine } from "../core/state-machine";
import { ExtensionAPI, ExtensionContext } from "../types";

export function registerHooks(pi: ExtensionAPI): void {

  // Event Hook 1: Session / Agent Initialization
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    const cwd = ctx?.cwd || process.cwd();
    const qEngine = new QualityGateEngine(cwd);
    const state = qEngine.getState();

    ctx?.ui?.notify(
      `Craftsmanship Plugin Active (HARD GATES ENFORCED). Current Phase: ${state.currentPhase} (Slice: ${state.sliceName})`,
      "info"
    );
  });

  // Event Hook 2: Hard Gate Interception Hook
  pi.on("before_tool_call", async (event: any, ctx: ExtensionContext) => {
    const toolName = event.name || event.toolName;
    const args = event.parameters || event.args || {};
    const cwd = ctx?.cwd || process.cwd();

    // Intercept file write/edit operations
    if ((toolName === "write_to_file" || toolName === "replace_file_content" || toolName === "multi_replace_file_content") && args.TargetFile) {
      const targetFile = String(args.TargetFile);
      const relPath = path.relative(cwd, targetFile);

      // Non-implementation paths to ignore
      const isExemptDir =
        relPath.startsWith("features/") ||
        relPath.startsWith("specs/") ||
        relPath.startsWith("docs/") ||
        relPath.startsWith("tests/") ||
        relPath.startsWith(".craftsmanship/") ||
        relPath.startsWith("node_modules/") ||
        relPath.startsWith("dist/") ||
        relPath.startsWith(".git/");

      const isTestFile =
        relPath.includes(".test.") ||
        relPath.includes(".spec.") ||
        relPath.includes("_test.") ||
        relPath.includes("test_");

      const isCodeExtension = /\.(ts|js|jsx|tsx|py|go|rs|java|cpp|c|cs|rb|php|kt|swift)$/i.test(relPath);

      const isSourceCode = !isExemptDir && !isTestFile && isCodeExtension;

      if (isSourceCode) {
        const qEngine = new QualityGateEngine(cwd);
        const check = qEngine.canTransitionTo("TDD_UNIT_RED_GREEN");

        if (!check.allowed) {
          ctx?.ui?.notify(`HARD QUALITY GATE BLOCKED: ${check.reason}`, "error");

          // HARD GATE ENFORCEMENT: Throw error to reject tool call execution
          throw new Error(
            `[CRAFTSMANSHIP HARD GATE BLOCK]: Attempting to write implementation code in '${relPath}' before completing required engineering phases. ${check.reason}`
          );
        }
      }
    }
  });
}
