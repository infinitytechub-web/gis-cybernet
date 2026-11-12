import type { QueryClient } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEYS } from "./dashboard-integrity";

export const LEAVE_QUERY_KEYS = ["leave-requests", "my-leave-requests", "leave-admin-dashboard", "leave-balances", "leave-usage-by-location", "approval-audit"] as const;

export function validateLeaveDecision(action: string, comments: string) {
  if ((action === "approved" || action === "rejected") && !comments.trim()) {
    throw new Error("Decision comments are required.");
  }
}

export async function refreshLeaveDashboards(client: QueryClient) {
  await Promise.all([...new Set([...DASHBOARD_QUERY_KEYS, ...LEAVE_QUERY_KEYS])].map(key => client.invalidateQueries({ queryKey: [key] })));
}