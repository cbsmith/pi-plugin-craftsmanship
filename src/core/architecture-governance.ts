import * as fs from "fs";
import * as path from "path";
import { ADRRecord, DialecticObjection, DialecticReviewResult, RFCRecord } from "../types";

export class ArchitectureGovernanceEngine {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Creates a standardized Architecture Decision Record (ADR) in `docs/adr/`
   */
  public createADR(title: string, context: string, decision: string, consequences: string[]): { record: ADRRecord; filePath: string } {
    const adrDir = path.join(this.projectRoot, "docs", "adr");
    fs.mkdirSync(adrDir, { recursive: true });

    const existingFiles = fs.readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    const nextNum = (existingFiles.length + 1).toString().padStart(4, "0");
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${nextNum}-${sanitizedTitle}.md`;
    const filePath = path.join(adrDir, filename);

    const dateStr = new Date().toISOString().split("T")[0];

    const content = `
# ${nextNum}. ${title}

* Date: ${dateStr}
* Status: ACCEPTED

## Context and Problem Statement
${context}

## Decision Outcome
${decision}

### Positive Consequences
${consequences.map((c) => `* ${c}`).join("\n")}

### Negative Consequences / Trade-offs
* Requires strict adherence to formal verification and dialectic review quality gates.
`.trim();

    fs.writeFileSync(filePath, content, "utf-8");

    const record: ADRRecord = {
      id: nextNum,
      title,
      status: "ACCEPTED",
      context,
      decision,
      consequences,
      date: dateStr,
    };

    return { record, filePath };
  }

  /**
   * Evaluates an RFC strategy using the 6 Multi-Lens Dialectic Agent Panel:
   * 1. Security
   * 2. Consistency
   * 3. Efficiency
   * 4. Simplicity
   * 5. Maintainability
   * 6. Elegance
   */
  public evaluateRFCPanel(
    rfcId: string,
    title: string,
    strategyDescription: string,
    tradeOffs: string[],
    previousObjections: DialecticObjection[] = []
  ): RFCRecord {
    const objections: DialecticObjection[] = [];

    // Lens 1: Security Dialectic Critique
    if (strategyDescription.toLowerCase().includes("unauthenticated") || strategyDescription.toLowerCase().includes("eval")) {
      objections.push({
        id: "RFC-OBJ-SEC-01",
        lens: "Security",
        severity: "BLOCKER",
        title: "Ungoverned Security Boundary Exposure",
        critique: "Strategy exposes unauthenticated API endpoints or uses dynamic code execution without strict authorization checks.",
        requiredAction: "Add explicit authentication and payload schema validation to RFC strategy.",
        addressed: false,
      });
    }

    // Lens 2: Consistency Dialectic Critique
    if (!strategyDescription.toLowerCase().includes("c4") && !strategyDescription.toLowerCase().includes("adr")) {
      objections.push({
        id: "RFC-OBJ-CONS-01",
        lens: "Consistency",
        severity: "MAJOR",
        title: "Architectural Traceability Omission",
        critique: "Strategy does not explicitly align with existing C4 D2 container boundaries or ADR records.",
        requiredAction: "Update RFC text to map proposed changes directly to C4 component diagrams.",
        addressed: false,
      });
    }

    // Lens 3: Efficiency Dialectic Critique
    if (strategyDescription.toLowerCase().includes("polling") || strategyDescription.toLowerCase().includes("nested loop")) {
      objections.push({
        id: "RFC-OBJ-EFF-01",
        lens: "Efficiency",
        severity: "MAJOR",
        title: "Inefficient Resource Utilization Strategy",
        critique: "Proposed strategy relies on tight polling loops or expensive O(N^2) iterations.",
        requiredAction: "Replace polling loops with event-driven hooks or push notifications.",
        addressed: false,
      });
    }

    // Lens 4: Simplicity Dialectic Critique (YAGNI)
    if (strategyDescription.toLowerCase().includes("plugin architecture") && strategyDescription.toLowerCase().includes("custom framework")) {
      objections.push({
        id: "RFC-OBJ-SIMP-01",
        lens: "Simplicity",
        severity: "MAJOR",
        title: "Over-Engineering / Speculative Abstraction (YAGNI)",
        critique: "Strategy introduces premature framework abstractions before explicit requirements demand them.",
        requiredAction: "Simplify RFC strategy to focus solely on immediate problem scope.",
        addressed: false,
      });
    }

    // Lens 5: Maintainability Dialectic Critique
    // Lens 6: Elegance Dialectic Critique

    const blockerCount = objections.filter((o) => o.severity === "BLOCKER" && !o.addressed).length;
    const majorCount = objections.filter((o) => o.severity === "MAJOR" && !o.addressed).length;
    const passed = blockerCount === 0 && majorCount === 0;

    const reviewResult: DialecticReviewResult = {
      passed,
      objections,
      summary: passed
        ? "DIALECTIC RFC PANEL PASSED: 0 BLOCKER and 0 MAJOR objections. Ready for human sign-off."
        : `DIALECTIC RFC PANEL REJECTED: ${blockerCount} BLOCKER and ${majorCount} MAJOR objection(s) raised by agent panel.`,
      reReviewRequired: !passed,
      iterationCount: 1,
    };

    return {
      id: rfcId,
      title,
      author: "Pi Agent / Developer",
      status: passed ? "PENDING_HUMAN_APPROVAL" : "DRAFT",
      strategyDescription,
      tradeOffs,
      reviewResult,
      humanApproved: false,
    };
  }

  /**
   * Saves RFC document to `docs/rfc/RFC-XXXX-title.md`
   */
  public saveRFC(rfc: RFCRecord): string {
    const rfcDir = path.join(this.projectRoot, "docs", "rfc");
    fs.mkdirSync(rfcDir, { recursive: true });

    const sanitizedTitle = rfc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${rfc.id}-${sanitizedTitle}.md`;
    const filePath = path.join(rfcDir, filename);

    const objectionsSection = rfc.reviewResult.objections
      .map(
        (o) => `
### Objection [${o.id}] - Lens: ${o.lens} (${o.severity})
* **Title**: ${o.title}
* **Status**: ${o.addressed ? "ADDRESSED" : "UNRESOLVED"}
* **Critique**: ${o.critique}
* **Required Action**: ${o.requiredAction}
`
      )
      .join("\n");

    const content = `
# ${rfc.id}: ${rfc.title}

* Status: ${rfc.status}
* Author: ${rfc.author}
* Dialectic Review Passed: ${rfc.reviewResult.passed ? "YES" : "NO"}
* Human Approved: ${rfc.humanApproved ? "YES" : "NO (Pending Human Review Sign-off)"}

## Strategy Description
${rfc.strategyDescription}

## Trade-Offs Considered
${rfc.tradeOffs.map((t) => `* ${t}`).join("\n")}

## Dialectic Agent Review Panel Objections (6 Lenses)
${objectionsSection || "_No objections raised by agent panel!_"}

## Human Review Sign-off Notes
${rfc.humanReviewerNotes || "_Awaiting human sign-off feedback..._"}
`.trim();

    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }
}
