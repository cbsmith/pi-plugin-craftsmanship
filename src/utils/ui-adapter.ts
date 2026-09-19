import { ExtensionUI } from "../types";

/**
 * Safely prompts the user for text input across different Pi UI context versions.
 */
export async function promptInput(ui?: ExtensionUI | any, title: string = "", placeholder: string = ""): Promise<string> {
  if (!ui) return "";
  try {
    if (typeof ui.input === "function") {
      const result = await ui.input(title, placeholder);
      return result ?? "";
    }
    if (typeof ui.ask === "function") {
      const result = await ui.ask(title);
      return result ?? "";
    }
  } catch (err) {
    console.error("UI Input Error:", err);
  }
  return "";
}

/**
 * Safely prompts the user for confirmation across different Pi UI context versions.
 */
export async function promptConfirm(ui?: ExtensionUI | any, title: string = "", message?: string): Promise<boolean> {
  if (!ui) return true;
  try {
    if (typeof ui.confirm === "function") {
      // Handle both 1-arg confirm(message) and 2-arg confirm(title, message)
      const result = await ui.confirm(title, message || title);
      return Boolean(result);
    }
  } catch (err) {
    console.error("UI Confirm Error:", err);
  }
  return true;
}

/**
 * Safely notifies the user across different Pi UI context versions.
 */
export function notifyUser(ui?: ExtensionUI | any, message: string = "", type: "info" | "success" | "warning" | "error" = "info"): void {
  if (!ui || typeof ui.notify !== "function") return;
  try {
    const safeType = type === "success" ? "info" : type;
    ui.notify(message, safeType);
  } catch (err) {
    console.error("UI Notify Error:", err);
  }
}
