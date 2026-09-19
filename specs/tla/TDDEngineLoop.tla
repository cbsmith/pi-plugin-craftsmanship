--------------------------- MODULE TDDEngineLoop ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES tddState, redVerified, greenVerified, killRatePercent, passedCleanly

States == {"UNTESTED", "RED_PHASE", "GREEN_PHASE", "MUTATION_PHASE", "TDD_COMPLETED"}

TypeOK ==
  /\ tddState \in States
  /\ redVerified \in BOOLEAN
  /\ greenVerified \in BOOLEAN
  /\ killRatePercent \in Nat
  /\ passedCleanly \in BOOLEAN

Init ==
  /\ tddState = "UNTESTED"
  /\ redVerified = FALSE
  /\ greenVerified = FALSE
  /\ killRatePercent = 0
  /\ passedCleanly = FALSE

VerifyRedFailure ==
  /\ tddState = "UNTESTED"
  /\ tddState' = "RED_PHASE"
  /\ redVerified' = TRUE
  /\ UNCHANGED <<greenVerified, killRatePercent, passedCleanly>>

VerifyGreenSuccess ==
  /\ tddState = "RED_PHASE"
  /\ redVerified = TRUE
  /\ tddState' = "GREEN_PHASE"
  /\ greenVerified' = TRUE
  /\ UNCHANGED <<redVerified, killRatePercent, passedCleanly>>

EvaluateMutationTesting ==
  /\ tddState = "GREEN_PHASE"
  /\ greenVerified = TRUE
  /\ tddState' = "MUTATION_PHASE"
  /\ killRatePercent' = 85
  /\ UNCHANGED <<redVerified, greenVerified, passedCleanly>>

CompleteTDDCycle ==
  /\ tddState = "MUTATION_PHASE"
  /\ redVerified = TRUE
  /\ greenVerified = TRUE
  /\ killRatePercent >= 85
  /\ tddState' = "TDD_COMPLETED"
  /\ passedCleanly' = TRUE
  /\ UNCHANGED <<redVerified, greenVerified, killRatePercent>>

Next == VerifyRedFailure \/ VerifyGreenSuccess \/ EvaluateMutationTesting \/ CompleteTDDCycle

Spec == Init /\ [][Next]_<<tddState, redVerified, greenVerified, killRatePercent, passedCleanly>>

\* Safety Invariants
NoGreenWithoutRed == greenVerified = TRUE => redVerified = TRUE
MutationKillRateThreshold == passedCleanly = TRUE => (killRatePercent >= 85 /\ redVerified = TRUE /\ greenVerified = TRUE)
=============================================================================
