/** Staff application pipeline helpers (pure, testable). */
export type AppStatus =
  | "submitted" | "shortlisted" | "interview_scheduled" | "interviewed" | "panel_recommended"
  | "panel_not_recommended" | "approved" | "rejected" | "posted" | "withdrawn";

export const STATUS_LABEL: Record<AppStatus, string> = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview scheduled",
  interviewed: "Interviewed",
  panel_recommended: "Panel recommended",
  panel_not_recommended: "Panel did not recommend",
  approved: "Approved — awaiting posting",
  rejected: "Rejected",
  posted: "Posted",
  withdrawn: "Withdrawn",
};

export const TYPE_LABEL: Record<string, string> = {
  position: "Position", posting: "Posting", transfer: "Transfer", recruitment: "Recruitment",
};

export const OPEN_STATUSES: AppStatus[] = ["submitted", "shortlisted", "interview_scheduled", "interviewed", "panel_recommended", "panel_not_recommended", "approved"];

export type NextAction = "shortlist" | "schedule" | "record" | "decide" | "post" | "transfer" | null;

/**
 * The next step for an application. Transfers are handled by the transfer approval
 * steps (command OIC/2IC then admin), so the pipeline only links to them.
 */
export function nextAction(type: string, status: AppStatus, hasOpenInterview: boolean): NextAction {
  if (type === "transfer") return OPEN_STATUSES.includes(status) ? "transfer" : null;
  switch (status) {
    case "submitted": return "shortlist";
    case "shortlisted": return "schedule";
    case "interview_scheduled": return hasOpenInterview ? "record" : "schedule";
    case "panel_recommended":
    case "panel_not_recommended": return "decide";
    case "approved": return "post";
    default: return null;
  }
}

export function applicantName(a: { applicant_kind: string; external_name?: string | null; profiles?: { first_name?: string | null; last_name?: string | null } | null }): string {
  if (a.applicant_kind === "external") return a.external_name ?? "—";
  const p = a.profiles;
  return p ? `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "—" : "—";
}
