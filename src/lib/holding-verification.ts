export type VerificationDecision = "approved" | "rejected" | "revoked";

export function canReviewVerification(role: string | null, reviewerId: string, ownerId: string, status: string, decision: VerificationDecision) {
  return role === "admin" && reviewerId !== ownerId &&
    (decision === "revoked" ? status === "approved" : status === "pending");
}

export function validateVerificationSubmission(staffId: string, hasPhoto: boolean): string | null {
  if (!staffId.trim()) return "Enter your registered Staff ID.";
  if (!hasPhoto) return "Select your staff photo.";
  return null;
}