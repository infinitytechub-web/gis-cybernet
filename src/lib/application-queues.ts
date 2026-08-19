import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for "what still needs action" per application table.
 * Terminal states (approved, rejected, collected, ready, issued, expired…) are
 * deliberately excluded so queue badges never show stale figures.
 */
export const PENDING_STATUSES = {
  visa_applications: ["submitted", "under_review"],
  visa_extensions: ["submitted", "under_review"],
  permits: ["submitted", "under_review"],
  passport_applications: ["submitted", "processing"],
  official_applications: ["submitted", "under_review"],
  enquiry_applications: ["submitted", "under_review"],
} as const;

export type ApplicationTable = keyof typeof PENDING_STATUSES;

/** Tables owned by the Processing module (pre-front-desk stage). */
export const PROCESSING_TABLES: ApplicationTable[] = [
  "visa_applications",
  "visa_extensions",
  "permits",
  "passport_applications",
];

/** Tables owned by the Front Desk module. */
export const FRONT_DESK_TABLES: ApplicationTable[] = [
  "official_applications",
  "enquiry_applications",
];

/** Every application table, for realtime invalidation subscriptions. */
export const ALL_APPLICATION_TABLES = Object.keys(PENDING_STATUSES) as ApplicationTable[];

/** Count rows in `table` that are still awaiting action. */
export async function countPending(table: ApplicationTable): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("status", PENDING_STATUSES[table] as unknown as string[]);
  return count ?? 0;
}

/** Pending count per table, keyed by table name. */
export async function countPendingByTable(
  tables: ApplicationTable[],
): Promise<Record<string, number>> {
  const counts = await Promise.all(tables.map((t) => countPending(t)));
  return tables.reduce<Record<string, number>>((acc, t, i) => {
    acc[t] = counts[i];
    return acc;
  }, {});
}

/** Total pending across the given tables. */
export async function sumPending(tables: ApplicationTable[]): Promise<number> {
  const counts = await Promise.all(tables.map((t) => countPending(t)));
  return counts.reduce((a, b) => a + b, 0);
}
