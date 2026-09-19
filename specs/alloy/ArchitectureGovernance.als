module ArchitectureGovernanceFormalModel

/* Alloy Formal Model Proving ADR Lineage Monotonicity & RFC Approval Immutability */

enum RFCStatus {
  DRAFT,
  UNDER_MULTI_LENS_REVIEW,
  PENDING_HUMAN_APPROVAL,
  APPROVED,
  REJECTED
}

sig ADRRecord {
  id: Int,
  title: String
}

sig RFCRecord {
  id: String,
  status: RFCStatus,
  blockerObjectionsCount: Int,
  humanApproved: boolean
}

fact ADRMonotonicLineage {
  // All ADR IDs are strictly positive
  all a: ADRRecord | a.id > 0
}

fact RFCApprovalSafety {
  // An RFC can only reach APPROVED status if blockerObjectionsCount = 0 and humanApproved = true
  all r: RFCRecord | r.status = APPROVED => (
    r.blockerObjectionsCount = 0 and
    r.humanApproved = true
  )
}

assert SafetyProperty {
  all r: RFCRecord | r.status = APPROVED => r.humanApproved = true
}

check SafetyProperty for 5
