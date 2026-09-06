import * as fs from "fs";
import * as path from "path";
import { BDDFeatureSpec, ClarifyingQuestion, GherkinScenario } from "../types";

export class BDDEngine {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Scans acceptance criteria for ambiguity and generates targeted clarifying questions.
   */
  public analyzeAcceptanceCriteria(featureName: string, userStory: string, criteria: string[]): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [];
    const ambiguousKeywords = ["fast", "user-friendly", "scalable", "flexible", "handles errors", "appropriate", "etc", "normal", "seamless"];

    criteria.forEach((criterion, index) => {
      ambiguousKeywords.forEach((keyword) => {
        if (criterion.toLowerCase().includes(keyword)) {
          questions.push({
            id: `Q-${index + 1}-${keyword}`,
            topic: `Ambiguity in criterion #${index + 1}: "${criterion}"`,
            question: `The term '${keyword}' in "${criterion}" is ambiguous. What exact quantitative threshold or specific behavior defines success for this scenario?`,
            resolved: false,
          });
        }
      });
    });

    if (criteria.length === 0) {
      questions.push({
        id: "Q-CRITERIA-EMPTY",
        topic: "Missing Acceptance Criteria",
        question: "No explicit acceptance criteria were provided for this feature. What are the key Given-When-Then boundary conditions?",
        resolved: false,
      });
    }

    return questions;
  }

  /**
   * Generates standard Gherkin syntax string from feature metadata and scenarios.
   */
  public buildGherkinFeature(featureName: string, userStory: string, scenarios: GherkinScenario[]): string {
    let output = `Feature: ${featureName}\n`;
    if (userStory) {
      const indented = userStory
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
      output += `${indented}\n\n`;
    }

    scenarios.forEach((sc) => {
      const tagStr = sc.tags && sc.tags.length > 0 ? `  ${sc.tags.map((t) => (t.startsWith("@") ? t : `@${t}`)).join(" ")}\n` : "";
      output += `${tagStr}  Scenario: ${sc.title}\n`;
      sc.given.forEach((g) => (output += `    Given ${g}\n`));
      sc.when.forEach((w) => (output += `    When ${w}\n`));
      sc.then.forEach((t) => (output += `    Then ${t}\n`));
      output += "\n";
    });

    return output.trim();
  }

  /**
   * Saves feature spec to `features/<feature-name>.feature`
   */
  public saveFeatureFile(featureName: string, gherkinContent: string): string {
    const featuresDir = path.join(this.projectRoot, "features");
    if (!fs.existsSync(featuresDir)) {
      fs.mkdirSync(featuresDir, { recursive: true });
    }
    const filename = `${featureName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.feature`;
    const filePath = path.join(featuresDir, filename);
    fs.writeFileSync(filePath, gherkinContent, "utf-8");
    return filePath;
  }

  /**
   * Verifies if BDD test execution output indicates a proper RED state (tests executed and failed as expected for missing implementation).
   */
  public verifyRedExecutionOutput(rawOutput: string): { isRed: boolean; reason: string } {
    if (!rawOutput || rawOutput.trim().length === 0) {
      return { isRed: false, reason: "No execution output provided for RED verification." };
    }

    const hasFailure =
      rawOutput.includes("FAIL") ||
      rawOutput.includes("failed") ||
      rawOutput.includes("AssertionError") ||
      rawOutput.includes("not implemented") ||
      rawOutput.includes("ERR!");

    const hasSyntaxCompilationError =
      rawOutput.includes("SyntaxError") || rawOutput.includes("Cannot find module") || rawOutput.includes("ParseError");

    if (hasSyntaxCompilationError) {
      return {
        isRed: false,
        reason: "Test failure is due to syntax or import compilation error, not assertion failure. Tests must be syntactically valid and fail RED on assertion/implementation.",
      };
    }

    if (hasFailure) {
      return {
        isRed: true,
        reason: "BDD test suite ran successfully and failed RED on missing implementation, as expected.",
      };
    }

    return {
      isRed: false,
      reason: "BDD test suite passed (GREEN) or did not fail! Red/Green TDD requires tests to fail RED before implementation is created.",
    };
  }
}
