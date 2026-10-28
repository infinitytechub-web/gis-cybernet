export interface RegionalCommandCard {
  id: string;
  name: string;
  type: string;
  activation_status: "active" | "pending";
  display_order: number | null;
  brand_color: string | null;
  staff_count: number | null;
  is_own: boolean;
  can_open: boolean;
}

/** Splits "Greater Accra Regional Command" into title + subtitle like the cards. */
export function splitCommandName(name: string): { title: string; subtitle: string } {
  const m = name.match(/^(.*?)\s+(Regional Command|Command)$/i);
  if (m) return { title: m[1], subtitle: m[2].replace(/^command$/i, "Command") };
  return { title: name, subtitle: "" };
}

/** Moves one card; returns the new id order. Never touches assignments. */
export function reorder<T extends { id: string }>(list: T[], from: string, to: string): T[] {
  const a = list.findIndex((x) => x.id === from), b = list.findIndex((x) => x.id === to);
  if (a < 0 || b < 0 || a === b) return list;
  const next = [...list];
  const [m] = next.splice(a, 1);
  next.splice(b, 0, m);
  return next;
}

export const commandDashboardPath = (id: string) => `/command-analytics/${id}`;
