--------------------------- MODULE DialecticReviewDriftGuard ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES reviewState, blockerCount, majorCount, hasDrift, sliceLOC, passed

States == {"UNREVIEWED", "DIALECTIC_REJECTED", "DIALECTIC_PASSED"}

TypeOK ==
  /\ reviewState \in States
  /\ blockerCount \in Nat
  /\ majorCount \in Nat
  /\ hasDrift \in BOOLEAN
  /\ sliceLOC \in Nat
  /\ passed \in BOOLEAN

Init ==
  /\ reviewState = "UNREVIEWED"
  /\ blockerCount = 0
  /\ majorCount = 0
  /\ hasDrift = FALSE
  /\ sliceLOC = 200
  /\ passed = FALSE

EvaluateReview ==
  /\ reviewState = "UNREVIEWED"
  /\ IF blockerCount = 0 /\ majorCount = 0 /\ hasDrift = FALSE /\ sliceLOC <= 400
     THEN /\ reviewState' = "DIALECTIC_PASSED"
          /\ passed' = TRUE
     ELSE /\ reviewState' = "DIALECTIC_REJECTED"
          /\ passed' = FALSE
  /\ UNCHANGED <<blockerCount, majorCount, hasDrift, sliceLOC>>

IntroduceDrift ==
  /\ hasDrift' = TRUE
  /\ reviewState' = "DIALECTIC_REJECTED"
  /\ passed' = FALSE
  /\ UNCHANGED <<blockerCount, majorCount, sliceLOC>>

ResolveObjections ==
  /\ blockerCount' = 0
  /\ majorCount' = 0
  /\ hasDrift' = FALSE
  /\ reviewState' = "UNREVIEWED"
  /\ passed' = FALSE
  /\ UNCHANGED <<sliceLOC>>

Next == EvaluateReview \/ IntroduceDrift \/ ResolveObjections

Spec == Init /\ [][Next]_<<reviewState, blockerCount, majorCount, hasDrift, sliceLOC, passed>>

\* Safety Invariants
NoPassWithBlockerOrMajor == passed = TRUE => (blockerCount = 0 /\ majorCount = 0)
DriftBlocksPass == hasDrift = TRUE => passed = FALSE
SliceLimitEnforced == sliceLOC > 400 => passed = FALSE
=============================================================================
