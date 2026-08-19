/**
 * Single source of truth for selectable status workflows.
 *
 * Two modules share the same shape so labels, badge colours, allowed
 * transitions and the audit trail behave identically everywhere:
 *  - Operations            → Open / In Progress / Resolved / Closed
 *  - Holding & Detention   → Detained / Released / Transferred
 *    (plus the legacy outcomes Bail, Repatriated, Court, Escaped)
 *
 * Status changes are always written through the `set_record_status` RPC so the
 * transition rules and the status_change_audit trail are enforced server-side.
 */

export type StatusEntity = "operations" | "enforcement_operations" | "detention_records";

export interface StatusOption {
  /** Value stored in the database. */
  value: string;
  label: string;
  /** Tailwind classes for the badge. */
  badgeClass: string;
  /** Solid dot / chart colour class. */
  dotClass: string;
  /** Hidden from the "change status" menu (legacy value kept for display). */
  legacy?: boolean;
}

export interface StatusWorkflow {
  entity: StatusEntity;
  /** Human label used in dialogs, e.g. "operation". */
  noun: string;
  options: StatusOption[];
  /** Allowed next values keyed by current value. */
  transitions: Record<string, string[]>;
  /** Statuses that require a reason before they can be applied. */
  reasonRequired: string[];
}

const OPERATION_OPTIONS: StatusOption[] = [
  { value: "open", label: "Open", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200", dotClass: "bg-blue-500" },
  { value: "in_progress", label: "In Progress", badgeClass: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200", dotClass: "bg-amber-500" },
  { value: "resolved", label: "Resolved", badgeClass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200", dotClass: "bg-emerald-500" },
  { value: "closed", label: "Closed", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground" },
];

const OPERATION_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed", "open"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

const DETENTION_OPTIONS: StatusOption[] = [
  { value: "in_custody", label: "Detained", badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200", dotClass: "bg-rose-500" },
  { value: "released", label: "Released", badgeClass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200", dotClass: "bg-emerald-500" },
  { value: "transferred", label: "Transferred", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200", dotClass: "bg-blue-500" },
  { value: "bail", label: "Bail", badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200", dotClass: "bg-cyan-500" },
  { value: "repatriated", label: "Repatriated", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200", dotClass: "bg-purple-500" },
  { value: "court", label: "Court", badgeClass: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200", dotClass: "bg-amber-500" },
  { value: "escaped", label: "Escaped", badgeClass: "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-200", dotClass: "bg-red-600" },
  // Legacy value — rows created before the rename still store `deported`.
  { value: "deported", label: "Repatriated", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200", dotClass: "bg-purple-500", legacy: true },
];

const DETENTION_OUTCOMES = ["released", "transferred", "bail", "repatriated", "court", "escaped"];

const DETENTION_TRANSITIONS: Record<string, string[]> = {
  in_custody: DETENTION_OUTCOMES,
  ...Object.fromEntries([...DETENTION_OUTCOMES, "deported"].map((s) => [s, ["in_custody"]])),
};

export const STATUS_WORKFLOWS: Record<StatusEntity, StatusWorkflow> = {
  operations: {
    entity: "operations",
    noun: "operation",
    options: OPERATION_OPTIONS,
    transitions: OPERATION_TRANSITIONS,
    reasonRequired: [],
  },
  enforcement_operations: {
    entity: "enforcement_operations",
    noun: "operation",
    options: OPERATION_OPTIONS,
    transitions: OPERATION_TRANSITIONS,
    reasonRequired: [],
  },
  detention_records: {
    entity: "detention_records",
    noun: "detention record",
    options: DETENTION_OPTIONS,
    transitions: DETENTION_TRANSITIONS,
    reasonRequired: DETENTION_OUTCOMES,
  },
};

/** Selectable (non-legacy) options for an entity — use for filters and forms. */
export function statusOptions(entity: StatusEntity): StatusOption[] {
  return STATUS_WORKFLOWS[entity].options.filter((o) => !o.legacy);
}

export function statusMeta(entity: StatusEntity, value?: string | null): StatusOption {
  const fallbackLabel = value ? value.replace(/_/g, " ") : "—";
  return (
    STATUS_WORKFLOWS[entity].options.find((o) => o.value === value) ?? {
      value: value ?? "",
      label: fallbackLabel,
      badgeClass: "bg-muted text-muted-foreground",
      dotClass: "bg-muted-foreground",
    }
  );
}

export function statusLabelFor(entity: StatusEntity, value?: string | null): string {
  return statusMeta(entity, value).label;
}

/** Allowed next statuses from the current one (never includes the current value). */
export function nextStatuses(entity: StatusEntity, current?: string | null): StatusOption[] {
  const wf = STATUS_WORKFLOWS[entity];
  const allowed = wf.transitions[current ?? ""] ?? wf.options.filter((o) => !o.legacy).map((o) => o.value);
  return allowed
    .filter((v) => v !== current)
    .map((v) => wf.options.find((o) => o.value === v))
    .filter((o): o is StatusOption => !!o && !o.legacy);
}

export function isStatusReasonRequired(entity: StatusEntity, next: string): boolean {
  return STATUS_WORKFLOWS[entity].reasonRequired.includes(next);
}
