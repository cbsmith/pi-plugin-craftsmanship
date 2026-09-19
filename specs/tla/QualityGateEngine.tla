--------------------------- MODULE QualityGateEngine ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions

Phases == {"UNINITIALIZED", "BDD", "DESIGN", "GOVERNANCE", "TDD", "MUTATION", "REVIEW", "HUMAN_SLICE_REVIEW", "COMPLETED_LOCKED"}
ExemptableGates == {"FORMAL_METHODS", "C4_DIAGRAMS", "ADR_DOCUMENTATION", "RFC_GOVERNANCE"}

TypeOK ==
  /\ phase \in Phases
  /\ bddVerified \in BOOLEAN
  /\ designVerified \in BOOLEAN
  /\ rfcApproved \in BOOLEAN
  /\ tddVerified \in BOOLEAN
  /\ reviewPassed \in BOOLEAN
  /\ humanApproved \in BOOLEAN
  /\ exemptions \subseteq ExemptableGates

Init ==
  /\ phase = "UNINITIALIZED"
  /\ bddVerified = FALSE
  /\ designVerified = FALSE
  /\ rfcApproved = FALSE
  /\ tddVerified = FALSE
  /\ reviewPassed = FALSE
  /\ humanApproved = FALSE
  /\ exemptions = {}

GrantHumanExemption(gate) ==
  /\ gate \in ExemptableGates
  /\ exemptions' = exemptions \cup {gate}
  /\ UNCHANGED <<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved>>

CompleteBDD ==
  /\ phase = "UNINITIALIZED"
  /\ phase' = "BDD"
  /\ bddVerified' = TRUE
  /\ UNCHANGED <<designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions>>

CompleteDesign ==
  /\ phase = "BDD"
  /\ bddVerified = TRUE
  /\ phase' = "DESIGN"
  /\ designVerified' = TRUE
  /\ UNCHANGED <<bddVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions>>

CompleteGovernance ==
  /\ (phase = "DESIGN" \/ (phase = "BDD" /\ "C4_DIAGRAMS" \in exemptions /\ "FORMAL_METHODS" \in exemptions))
  /\ (designVerified = TRUE \/ ("C4_DIAGRAMS" \in exemptions /\ "FORMAL_METHODS" \in exemptions))
  /\ phase' = "GOVERNANCE"
  /\ rfcApproved' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, tddVerified, reviewPassed, humanApproved, exemptions>>

StartTDD ==
  /\ (phase = "GOVERNANCE" \/ (phase = "DESIGN" /\ "RFC_GOVERNANCE" \in exemptions))
  /\ (rfcApproved = TRUE \/ "RFC_GOVERNANCE" \in exemptions)
  /\ phase' = "TDD"
  /\ tddVerified' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, reviewPassed, humanApproved, exemptions>>

CompleteReview ==
  /\ phase = "TDD"
  /\ tddVerified = TRUE
  /\ phase' = "REVIEW"
  /\ reviewPassed' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, tddVerified, humanApproved, exemptions>>

ConductHumanSliceReview ==
  /\ phase = "REVIEW"
  /\ reviewPassed = TRUE
  /\ phase' = "HUMAN_SLICE_REVIEW"
  /\ humanApproved' = TRUE
  /\ UNCHANGED <<bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, exemptions>>

LockSlice ==
  /\ phase = "HUMAN_SLICE_REVIEW"
  /\ humanApproved = TRUE
  /\ phase' = "COMPLETED_LOCKED"
  /\ UNCHANGED <<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions>>

TerminalStutter ==
  /\ phase = "COMPLETED_LOCKED"
  /\ UNCHANGED <<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions>>

Next == 
  \/ CompleteBDD 
  \/ CompleteDesign 
  \/ CompleteGovernance 
  \/ StartTDD 
  \/ CompleteReview 
  \/ ConductHumanSliceReview 
  \/ LockSlice 
  \/ TerminalStutter
  \/ \E g \in ExemptableGates : GrantHumanExemption(g)

Spec == Init /\ [][Next]_<<phase, bddVerified, designVerified, rfcApproved, tddVerified, reviewPassed, humanApproved, exemptions>>

\* Safety Invariants to prove with TLC Model Checker
NoUnAuthorizedCodeWriting == phase = "TDD" => (bddVerified /\ (designVerified \/ "FORMAL_METHODS" \in exemptions) /\ (rfcApproved \/ "RFC_GOVERNANCE" \in exemptions))
NoCompletionWithoutHumanSignOff == phase = "COMPLETED_LOCKED" => humanApproved
=============================================================================
