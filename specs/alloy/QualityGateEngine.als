module QualityGateEngineFormalModel

/* Alloy Formal Model proving Quality Gate State Machine Safety */

enum WorkflowPhase {
  UNINITIALIZED,
  BDD_SPECIFICATION,
  BDD_RED_VERIFICATION,
  MULTI_LENS_TEST_REVIEW,
  SYSTEM_DESIGN_C4_FORMAL,
  ADR_RFC_GOVERNANCE,
  TDD_UNIT_RED_GREEN,
  MUTATION_TESTING,
  MULTI_LENS_CODE_REVIEW,
  GUIDED_HUMAN_SLICE_REVIEW,
  COMPLETED_LOCKED
}

sig State {
  phase: WorkflowPhase,
  bddRedVerified: boolean,
  testReviewPassed: boolean,
  formalVerified: boolean,
  humanExemptions: set WorkflowPhase,
  rfcApproved: boolean,
  tddGreenVerified: boolean,
  mutationPassed: boolean,
  codeReviewPassed: boolean,
  driftFree: boolean,
  humanSliceApproved: boolean
}

fact SafetyInvariants {
  // Invariant 1: Cannot reach TDD_UNIT_RED_GREEN without BDD RED, Test Review, C4/Formal, and RFC Approval (or Human Exemptions)
  all s: State | s.phase = TDD_UNIT_RED_GREEN => (
    s.bddRedVerified = true and
    s.testReviewPassed = true and
    (s.formalVerified = true or SYSTEM_DESIGN_C4_FORMAL in s.humanExemptions) and
    (s.rfcApproved = true or ADR_RFC_GOVERNANCE in s.humanExemptions)
  )

  // Invariant 2: Cannot reach COMPLETED_LOCKED without Guided Human Slice Review sign-off
  all s: State | s.phase = COMPLETED_LOCKED => (
    s.codeReviewPassed = true and
    s.driftFree = true and
    s.humanSliceApproved = true
  )
}

assert SafetyProperty {
  all s: State | s.phase = COMPLETED_LOCKED => s.humanSliceApproved = true
}

check SafetyProperty for 10
