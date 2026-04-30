/** Canonical labels for the Interlink module. Update here to change everywhere. */
export const INTERLINK_LABELS = {
  /** Short nav label (sidebar, dashboard widget, breadcrumbs). */
  nav: "Interlink System",
  /** Page title shown in the page header. */
  title: "Interlink System",
  /** Tagline shown beneath the page title. */
  tagline: "Command-tier dispatch hub: Intranet · Internet · Extranet",
} as const;

export type InterlinkScope = "intranet" | "internet" | "extranet" | "mixed";

export type InterlinkReportKind =
  | "staff"
  | "daily"
  | "weekly"
  | "monthly"
  | "annual"
  | "all"
  | "custom";

export const REPORT_KIND_LABELS: Record<InterlinkReportKind, string> = {
  staff: "Staff Report",
  daily: "Daily Report",
  weekly: "Weekly Report",
  monthly: "Monthly Report",
  annual: "Annual Report",
  all: "All Reports",
  custom: "Custom Selection",
};

export const SCOPE_META: Record<
  Exclude<InterlinkScope, "mixed">,
  { label: string; tone: string; description: string }
> = {
  intranet: {
    label: "Intranet",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    description: "Internal staff & departments",
  },
  internet: {
    label: "Internet",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    description: "Public / web-facing recipients",
  },
  extranet: {
    label: "Extranet",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
    description: "Other commands & partner agencies",
  },
};
