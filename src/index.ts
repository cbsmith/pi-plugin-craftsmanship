import { ExtensionAPI } from "./types";
import { registerTools } from "./tools";
import { registerCommands } from "./commands";
import { registerHooks } from "./hooks";

/**
 * Pi Craftsmanship Plugin Entry Point
 */
export default function (pi: ExtensionAPI): void {
  // Register custom Pi tools
  registerTools(pi);

  // Register slash commands
  registerCommands(pi);

  // Register event lifecycle hooks
  registerHooks(pi);
}

export * from "./types";
export * from "./core/state-machine";
export * from "./core/bdd-engine";
export * from "./core/test-review-panel";
export * from "./core/system-design";
export * from "./core/architecture-governance";
export * from "./core/tdd-engine";
export * from "./core/code-review-panel";
