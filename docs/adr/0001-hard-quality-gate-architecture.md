# 0001. Hard Quality Gate Architecture & Dialectic Reviews

* Date: 2026-09-06
* Status: ACCEPTED

## Context and Problem Statement
LLM-based coding agents frequently jump ahead to write implementation code prematurely, skipping BDD specification, architectural C4 design, formal verification, or dialectic code reviews.

## Decision Outcome
Implement strict hard-gate interception in Pi event hooks (`before_tool_call`), blocking file write operations on `src/` unless preliminary quality gate phases (BDD RED, Test Review, AST C4/Formal Specs, RFC Sign-off) have passed. Require dialectic reviews (BLOCKER/MAJOR/MINOR objections) and guided human slice review walkthroughs before slice completion.

### Positive Consequences
* Prevents agents from bypassing preliminary design phases.
* Enforces mathematically sound formal specifications (Alloy/TLA+) and stateful property tests.
* Guarantees human oversight at critical governance checkpoints and guided slice reviews.

### Negative Consequences / Trade-offs
* Requires agents to complete explicit pre-implementation steps before writing code. Low-risk exemptions require human-approved sign-offs.
