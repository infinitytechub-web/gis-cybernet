import { format } from "date-fns";

export type VaultLogRow = { id: string; created_at: string; action: string; file_id: string | null; file_title: string; file_name: string; detail: string | null; actor_user_id: string | null; actor_name: string | null; actor_staff_id: string | null; actor_rank: string | null };

export const VAULT_ACTION_LABEL: Record<string, string> = { upload: "Uploaded", preview: "Viewed", download: "Downloaded", modify: "Changed", archive: "Archived", restore: "Restored" };
export const vaultActionLabel = (a: string) => VAULT_ACTION_LABEL[a] ?? a;

const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function buildVaultLogCsv(rows: VaultLogRow[]): string {
  const head = ["Date", "Time", "Action", "File title", "File name", "Officer", "Rank", "Staff ID", "Details"];
  const body = rows.map(r => { const d = new Date(r.created_at); return [format(d, "dd/MM/yyyy"), format(d, "HH:mm:ss"), vaultActionLabel(r.action), r.file_title, r.file_name, r.actor_name ?? "Unknown user", r.actor_rank ?? "", r.actor_staff_id ?? "", r.detail ?? ""].map(cell).join(","); });
  return [head.join(","), ...body].join("\n");
}
