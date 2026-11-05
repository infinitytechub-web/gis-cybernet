export const APPRAISAL_CRITERIA = ["job_knowledge", "quality_of_work", "productivity", "discipline_conduct", "leadership_teamwork", "initiative", "punctuality_attendance"] as const;
export const APPRAISAL_STATES: Record<string, string> = { draft: "Draft", submitted: "Awaiting review", under_review: "Under review", returned: "Corrections required", approved: "Approved", acknowledged: "Acknowledged" };
export function validateAppraisalScores(scores: Record<string, number>): boolean {
  return Object.keys(scores).length === 7 && APPRAISAL_CRITERIA.every(key => Number.isInteger(scores[key]) && scores[key] >= 1 && scores[key] <= 5);
}
export function appraisalDetailLink(row: { staff_profile_id: string; period_year: number; period_month: number | null }): string {
  return `/appraisals/officer/${row.staff_profile_id}?year=${row.period_year}${row.period_month == null ? "" : `&month=${row.period_month}`}`;
}