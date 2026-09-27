import type { KpiAlert } from "@/components/dashboard/KpiTile";

export function strengthAlert(active: number, authorised?: number | null): KpiAlert | null {
  if (!authorised || authorised <= 0) return null;
  const pct = Math.round((active / authorised) * 100);
  if (pct < 85) return { level: "danger", text: `Understrength — ${pct}% of authorised` };
  if (pct < 95) return { level: "warning", text: `${Math.max(0, authorised - active)} below authorised` };
  return null;
}

export function activeRatioAlert(active: number, total: number): KpiAlert | null {
  if (total < 5) return null;
  const pct = Math.round((active / total) * 100);
  if (pct < 60) return { level: "danger", text: `Only ${pct}% active` };
  if (pct < 75) return { level: "warning", text: `${pct}% active` };
  return null;
}

export function absenceAlert(absent: number, active: number): KpiAlert | null {
  if (active < 5 || absent <= 0) return null;
  const pct = Math.round((absent / active) * 100);
  if (pct >= 20) return { level: "danger", text: `${pct}% not checked in` };
  if (pct >= 10) return { level: "warning", text: `${pct}% not checked in` };
  return null;
}

export function pendingAlert(count: number, label: string): KpiAlert | null {
  if (count >= 10) return { level: "danger", text: `${count} ${label} need action` };
  if (count > 0) return { level: "warning", text: `${count} ${label} awaiting action` };
  return null;
}

export function completenessAlert(percent: number): KpiAlert | null {
  if (percent < 80) return { level: "danger", text: `${100 - percent}% of required fields missing` };
  if (percent < 95) return { level: "warning", text: `${100 - percent}% of required fields missing` };
  return null;
}