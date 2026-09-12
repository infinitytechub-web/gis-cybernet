/**
 * Single source of truth for staff/employee record statuses.
 *
 * Statuses are stored on `profiles.status` (Postgres enum `staff_status`).
 * "Retired" and "Interdicted" switch sign-in off; the record is never deleted.
 */
export const STAFF_STATUSES = [
  "active",
  "partially_active",
  "inactive",
  "study_leave",
  "transferred",
  "interdicted",
  "retired",
] as const;

export type StaffStatusValue = (typeof STAFF_STATUSES)[number];

/** Statuses an officer can be moved to by a "Deactivate" action. */
export const DEACTIVATION_STATUSES: StaffStatusValue[] = [
  "partially_active",
  "inactive",
  "interdicted",
  "retired",
];

export const STAFF_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  partially_active: "Partially Active",
  inactive: "Inactive",
  study_leave: "Study Leave",
  transferred: "Transferred",
  interdicted: "Interdicted",
  retired: "Retired",
};

export function staffStatusLabel(status: string | null | undefined) {
  if (!status) return "—";
  return STAFF_STATUS_LABELS[status] ?? status;
}

/** Badge colours — kept in one place so every list reads the same. */
export function staffStatusColor(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "partially_active":
      return "bg-teal-100 text-teal-800";
    case "inactive":
      return "bg-red-100 text-red-800";
    case "study_leave":
      return "bg-amber-100 text-amber-800";
    case "transferred":
      return "bg-sky-100 text-sky-800";
    case "interdicted":
      return "bg-orange-100 text-orange-900";
    case "retired":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Statuses that block sign-in. */
export function statusBlocksLogin(status: string | null | undefined) {
  return status === "retired" || status === "interdicted";
}
