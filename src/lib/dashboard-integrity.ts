export const DASHBOARD_QUERY_KEYS = [
  "admin-overview-summary", "admin-overview-commands", "dash", "command-dashboard",
  "command-dashboard-live", "command-dashboard-units", "unit-dashboard", "staff-analytics",
  "regional-commands", "today-duty", "command-approval-queue",
] as const;

export const DASHBOARD_LIVE_TABLES = [
  "profiles", "org_positions", "staff_appointments", "staff_promotions", "staff_exits",
  "staff_transfer_requests", "staff_applications", "fleet_alerts", "fleet_messages",
  "guard_schedules", "security_monitor_alerts",
] as const;

export function sumCounts(parts: Record<string, number> | undefined) {
  return Object.values(parts ?? {}).reduce((sum, value) => sum + value, 0);
}

export function dashboardSyncState(online: boolean, failed: boolean, updatedAt: number, now = Date.now()) {
  if (!online) return "offline";
  if (failed) return "failed";
  if (!updatedAt) return "loading";
  return now - updatedAt > 120_000 ? "stale" : "current";
}

export function dashboardRetry(attempt: number, error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e?.code === "42501" || /authoris|authoriz|permission|authentication/i.test(e?.message ?? "")) return false;
  return attempt < 3;
}

export function reportingSince(range: string, now = Date.now()) {
  const days = Number(range);
  return Number.isFinite(days) && days > 0 ? new Date(now - days * 864e5).toISOString() : null;
}

export function validateCommandSnapshot(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Command data unavailable");
  const raw = value as { as_of?: unknown; day?: unknown; days?: unknown; branches?: unknown };
  if (typeof raw.as_of !== "string" || !Number.isFinite(Date.parse(raw.as_of)) ||
      typeof raw.day !== "string" || typeof raw.days !== "number" || !Array.isArray(raw.branches)) {
    throw new Error("Command data incomplete");
  }
  return raw;
}