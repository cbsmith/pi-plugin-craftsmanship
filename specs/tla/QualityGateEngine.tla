--------------------------- MODULE QualityGateEngine ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved

Phases == {"UNINITIALIZED", "BDD", "DESIGN", "GOVERNANCE", "TDD", "MUTATION", "REVIEW", "HUMAN_SLICE_REVIEW", "COMPLETED_LOCKED"}

TypeOK ==
  /\ phase \in Phases
  /\ bddVerified \in BOOLEAN
  /\ designVerified \in BOOLEAN
  /\ rfcApproved \in BOOLEAN
  /\ tddVerified \in BOOLEAN
  /\ reviewPassed \in BOOLEAN
  /\ humanApproved \in BOOLEAN

Init ==
  /\ phase = "UNINITIALIZED"
  /\ bddVerified = FALSE
  /\ designVerified = FALSE
  /\ rfcApproved = FALSE
  /\ tddVerified = FALSE
  /\ reviewPassed = FALSE
  /\ humanApproved = FALSE

CompleteBDD ==
  /\ phase = "UNINITIALIZED"
  /\ phase' = "BDD"
  /\ bddVerified' = TRUE
  /\ UNCHANGED <<designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

CompleteDesign ==
  /\ phase = "BDD"
  /\ bddVerified = TRUE
  /\ phase' = "DESIGN"
  /\ designVerified' = TRUE
  /\ UNCHANGED <<bddVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

CompleteGovernance ==
  /\ phase = "DESIGN"
  /\ designVerified = TRUE
  /\ phase' = "GOVERNANCE"
  /\ rfcApproved' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, tddVerified, reviewPassed, humanApproved>>

StartTDD ==
  /\ phase = "GOVERNANCE"
  /\ rfcApproved = TRUE
  /\ phase' = "TDD"
  /\ tddVerified' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, reviewPassed, humanApproved>>

CompleteReview ==
  /\ phase = "TDD"
  /\ tddVerified = TRUE
  /\ phase' = "REVIEW"
  /\ reviewPassed' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, tddVerified, humanApproved>>

ConductHumanSliceReview ==
  /\ phase = "REVIEW"
  /\ reviewPassed = TRUE
  /\ phase' = "HUMAN_SLICE_REVIEW"
  /\ humanApproved' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed>>

LockSlice ==
  /\ phase = "HUMAN_SLICE_REVIEW"
  /\ humanApproved = TRUE
  /\ phase' = "COMPLETED_LOCKED"
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

TerminalStutter ==
  /\ phase = "COMPLETED_LOCKED"
  /\ UNCHANGED <<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

Next == CompleteBDD \/ CompleteDesign \/ CompleteGovernance \/ StartTDD \/ CompleteReview \/ ConductHumanSliceReview \/ LockSlice \/ TerminalStutter

Spec == Init /\ [][Next]_<<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

\* Safety Invariants to prove with TLC Model Checker
NoUnAuthorizedCodeWriting == phase = "TDD" => (bddVerified /\ designVerified /\ rfcApproved)
NoCompletionWithoutHumanSignOff == phase = "COMPLETED_LOCKED" => humanApproved
=============================================================================
