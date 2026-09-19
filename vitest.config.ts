import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "specs/**/*.test.ts"],
    exclude: ["**/tmp_*/**", "**/node_modules/**", "**/dist/**"],
  },
});
