import { describe, it, expect } from "vitest";
import { TDDEngine } from "../../src/core/tdd-engine";

describe("TDDEngine Formal Model Stateful Property Verification", () => {
  it("preserves TLA+ invariant NoGreenWithoutRed: green verification requires prior red verification", () => {
    const tdd = new TDDEngine();

    // 1. Unverified RED run must fail GREEN verification
    const invalidRun = tdd.runAutoTDDIterationLoop(
      "tests/demo.test.ts",
      "src/demo.ts",
      "PASS tests/demo.test.ts", // RED log was actually passing -> INVALID RED
      "PASS tests/demo.test.ts"
    );

    expect(invalidRun.redVerified).toBe(false);
    expect(invalidRun.passedCleanly).toBe(false);

    // 2. Verified RED run followed by GREEN run passes cleanly
    const validRun = tdd.runAutoTDDIterationLoop(
      "tests/demo.test.ts",
      "src/demo.ts",
      "FAIL tests/demo.test.ts - ReferenceError: Demo is not defined", // Valid RED log
      "PASS tests/demo.test.ts" // Valid GREEN log
    );

    expect(validRun.redVerified).toBe(true);
    expect(validRun.greenVerified).toBe(true);
    expect(validRun.passedCleanly).toBe(true);
  });

  it("preserves TLA+ invariant MutationKillRateThreshold: mutation kill rate must be >= 85%", () => {
    const tdd = new TDDEngine();
    const result = tdd.evaluateMutationTesting("describe('Demo', () => {})", "export class Demo {}");

    expect(result.killRatePercent).toBeGreaterThanOrEqual(85);
    expect(result.passedThreshold).toBe(true);
  });
});
