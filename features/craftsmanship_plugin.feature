Feature: Pi Craftsmanship Quality Gate Plugin
  As a software engineer using the Pi Coding Agent
  I want a strict quality-gate harness
  So that all code produced by agents follows BDD, TDD, C4 design, formal verification, dialectic reviews, and guided human slice sign-offs.

  @bdd @quality-gate
  Scenario: BDD Feature Acceptance Criteria & Ambiguity Clarification
    Given a project is initialized with Craftsmanship quality gates
    When acceptance criteria contain ambiguous terms such as "fast" or "user-friendly"
    Then targeted clarifying questions are generated
    And Given-When-Then Gherkin feature files are created in features/

  @test-review @slice-limit
  Scenario: Pre-Implementation Dialectic Test Review & Slice LOC Limit
    Given BDD feature scenarios are specified and verified RED
    When the test suite is evaluated across 4 dialectic lenses
    Then tests are checked for acceptance coverage, edge cases, flakiness hazards, and fixture isolation
    And any slice exceeding 400 lines of code triggers a BLOCKER objection

  @c4 @formal-methods
  Scenario: AST C4 Diagrams & Formal Verification (Alloy & TLA+)
    Given a problem slice design is under review
    When C4 diagrams are generated from code AST into D2 syntax
    And Alloy declarative logic models and TLA+ state specs are checked
    Then state invariants are abstractly verified
    And any state counterexample trace blocks transition to implementation

  @adr @rfc @governance
  Scenario: Architecture Governance & Low-Risk Exemptions
    Given an architectural strategy is proposed
    When MADR decision records are created in docs/adr/
    And RFC strategies are evaluated across 6 dialectic agent lenses
    Then human review sign-off is required for RFC approval
    And skipping formal steps on low-risk work requires explicit human-approved exemption

  @tdd @mutation
  Scenario: Self-Healing TDD RED/GREEN Cycle & Mutation Testing
    Given unit tests are written before implementation
    When tests are executed prior to code, they must fail RED
    And implementation code turns tests GREEN
    Then mutation testing must achieve at least an 85% mutant kill rate

  @review @drift-guard @human-walkthrough
  Scenario: Post-Implementation Dialectic Code Review & Guided Human Slice Sign-off
    Given code implementation and tests are complete
    When static analysis diagnostics and Architectural Drift Guard are evaluated
    And 7 dialectic code review lenses raise 0 BLOCKER objections
    Then a 6-checkpoint Guided Human Slice Review walkthrough is presented
    And human sign-off locks the slice as COMPLETED_LOCKED
